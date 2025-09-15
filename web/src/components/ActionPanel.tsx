import { useEffect, useMemo, useRef, useState } from 'react';
import { getSocket, getRemembered } from '../lib/socket';
import TradePanel from './TradePanel';
import type { GameSnapshot } from '../types';
import { buildDefaultBoardTiles } from '../lib/boardFallback';
import { houseCostForGroup } from '../lib/rentData';
import type { BoardTile } from '../types';
import StockModal from './StockModal';
import StockChartsModal from './StockChartsModal';
import BondChartsModal from './BondChartsModal';
import DashboardModal from './DashboardModal';
import { playGameSound, initializeAudio } from '../lib/audio';
import { normalizeName, equalNames } from '../lib/names';
import { getSocket as _gs } from '../lib/socket';

type Props = { lobbyId: string; snapshot: GameSnapshot };

export default function ActionPanel({ lobbyId, snapshot }: Props) {
  const s = getSocket();
  const me = snapshot.players?.[snapshot.current_turn];
  // Simple stored name - no more reactive complexity
  const storedName = (getRemembered().displayName || '').trim();
  
  const myName = useMemo(() => {
    if (!storedName) return me?.name || '';
    
    // Simple exact match only
    const found = (snapshot?.players || []).find(p => p.name === storedName);
    return found?.name || storedName || (me?.name || '');
  }, [snapshot?.players, storedName, me?.name]);
  const myPlayer = (snapshot.players || []).find(p => equalNames(p.name, myName));
  const [showTrade, setShowTrade] = useState(false);
  const [showTradeAdvanced, setShowTradeAdvanced] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logFilters, setLogFilters] = useState<Set<string>>(new Set());
  const [showTrades, setShowTrades] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<string>('');
  // Automation toggles persisted
  const [autoRoll, setAutoRoll] = useState<boolean>(() => localStorage.getItem('auto.roll') === '1' ? true : false);
  const [autoBuy, setAutoBuy] = useState<boolean>(() => localStorage.getItem('auto.buy') === '1' ? true : false);
  const [autoEnd, setAutoEnd] = useState<boolean>(() => localStorage.getItem('auto.end') === '1' ? true : false);
  const [autoHouses, setAutoHouses] = useState<boolean>(() => localStorage.getItem('auto.houses') === '1' ? true : false);
  const [autoMortgage, setAutoMortgage] = useState<boolean>(() => localStorage.getItem('auto.mortgage') === '1' ? true : false);
  const [minKeep, setMinKeep] = useState<number>(() => parseInt(localStorage.getItem('auto.minKeep') || '0', 10));
  const [costRule, setCostRule] = useState<'any' | 'above' | 'below'>(() => (localStorage.getItem('auto.costRule') as any) || 'any');
  const [costValue, setCostValue] = useState<number>(() => parseInt(localStorage.getItem('auto.costValue') || '0', 10));
  const [autoSpread, setAutoSpread] = useState<boolean>(() => localStorage.getItem('auto.spread') === '1');
  const [tiles, setTiles] = useState<Record<number, BoardTile>>({});
  const logRef = useRef<HTMLDivElement | null>(null);
  // Trade detail cache + navigation
  const [openTradeDetailId, setOpenTradeDetailId] = useState<string | null>(() => localStorage.getItem('ui.openTradeDetail') || null);
  const tradeCacheRef = useRef<Map<string, any>>(new Map());
  const tradeOrderRef = useRef<string[]>([]); // insertion order for navigation

  function cacheTrade(t: any) {
    if (!t) return;
    const id = String(t.id);
    const cache = tradeCacheRef.current;
    if (!cache.has(id)) {
      tradeOrderRef.current.push(id);
    }
    cache.set(id, { ...cache.get(id), ...t }); // merge/update
  }

  function openTradeDetail(id: string) {
    if (!id) return;
    setOpenTradeDetailId(id);
    localStorage.setItem('ui.openTradeDetail', id);
    // Ensure trade is cached if currently pending
    const pending = (snapshot.pending_trades || []).find((p: any) => String(p.id) === id);
    if (pending) cacheTrade(pending);
  }

  function closeTradeDetail() {
    setOpenTradeDetailId(null);
    localStorage.removeItem('ui.openTradeDetail');
  }
  const [kickStatus, setKickStatus] = useState<{ target?: string | null; remaining?: number | null }>({});
  // Disconnect timers per player (seconds remaining)
  const [disconnectRemainMap, setDisconnectRemainMap] = useState<Record<string, number>>({});
  // Simple cash change animation map
  const [moneyAnimations, setMoneyAnimations] = useState<Record<string, string>>({});
  const [openStock, setOpenStock] = useState<any | null>(null);
  const [showStockCharts, setShowStockCharts] = useState(false);
  // Bonds UI state
  const [showBondCharts, setShowBondCharts] = useState(false);
  const [collapseAuto, setCollapseAuto] = useState(false);
  const [collapseRecurring, setCollapseRecurring] = useState(false);
  const [collapseRentals, setCollapseRentals] = useState(false);
  // Mobile-first: collapse heavy sections by default on small screens
  const [isSmall, setIsSmall] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.matchMedia('(max-width: 768px)').matches; } catch { return false; }
  });
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsSmall(mql.matches);
    try { mql.addEventListener('change', onChange); } catch { mql.addListener(onChange); }
    onChange();
    return () => { try { mql.removeEventListener('change', onChange); } catch { mql.removeListener(onChange); } };
  }, []);
  useEffect(() => {
    if (isSmall && !autoCollapsedRef.current) {
      setCollapseAuto(true);
      setCollapseRecurring(true);
      setCollapseRentals(true);
      autoCollapsedRef.current = true;
    }
  }, [isSmall]);
  // Inline expanded pending trades
  const [openInline, setOpenInline] = useState<Set<number | string>>(new Set());

  // Allow GameBoard to open Trades/Log via global events
  useEffect(() => {
    const openTrades = () => setShowTrades(true);
    const openLog = () => setShowLog(true);
    window.addEventListener('open-trades' as any, openTrades);
    window.addEventListener('open-log' as any, openLog);
    return () => {
      window.removeEventListener('open-trades' as any, openTrades);
      window.removeEventListener('open-log' as any, openLog);
    };
  }, []);

  // Subscribe to lobby_state for vote-kick status
  useEffect(() => {
    const onLobbyState = (l: any) => {
      if (!l || l.id == null) return;
      setKickStatus({ target: l.kick_target, remaining: l.kick_remaining });
      if (l.disconnect_remain && typeof l.disconnect_remain === 'object') {
        setDisconnectRemainMap(l.disconnect_remain as Record<string, number>);
      }
    };
    s.on('lobby_state', onLobbyState);
    return () => { s.off('lobby_state', onLobbyState); };
  }, [s]);

  // Local per-second countdown for disconnect timers (no server spam)
  useEffect(() => {
    const t = setInterval(() => {
      setDisconnectRemainMap(prev => {
        const next: Record<string, number> = {};
        for (const k of Object.keys(prev)) {
          const v = typeof prev[k] === 'number' ? prev[k] : 0;
          next[k] = v > 0 ? v - 1 : 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const snapTiles: any[] | undefined = (snapshot as any)?.tiles;
    if (Array.isArray(snapTiles) && snapTiles.length > 0) {
      setTiles(Object.fromEntries(snapTiles.map((t: any) => [t.pos, t])));
      return;
    }
    if (Object.keys(tiles).length === 0) {
      const arr = buildDefaultBoardTiles();
      setTiles(Object.fromEntries(arr.map((t) => [t.pos, t])));
    }
  }, [(snapshot as any)?.tiles]);

  // Reset automation settings to defaults only on brand-new game (turns === 0) or when game ends
  useEffect(() => {
    const currentTurns = snapshot?.turns || 0;
    const gameOver = snapshot?.game_over;
    if (currentTurns < 1 || gameOver) {
      // New game detected or game ended - reset all automation settings to defaults
      setAutoRoll(false);
      setAutoBuy(false);
      setAutoEnd(false);
      setAutoHouses(false);
      setAutoMortgage(false);
      setMinKeep(0);
      setCostRule('any');
      setCostValue(0);
      setAutoSpread(false);
    }
  }, [snapshot?.turns, snapshot?.game_over]);

  // Initialize audio system
  useEffect(() => {
    initializeAudio();
  }, []);

  // Ingest pending trades into cache each snapshot update
  useEffect(() => {
    (snapshot.pending_trades || []).forEach(cacheTrade);
  }, [snapshot.pending_trades]);

  // If we have an open trade id but it's never been cached (e.g., deep link from historical log), attempt to hydrate minimal info from log
  useEffect(() => {
    if (!openTradeDetailId) return;
    const cache = tradeCacheRef.current;
    if (cache.has(openTradeDetailId)) return;
    // Find any log entries referencing this trade id to fabricate a stub
    const entries = (snapshot.log || []).filter((e: any) => String(e.id) === String(openTradeDetailId));
    if (entries.length > 0) {
      // Use earliest trade_* entry as base
      const base = entries[0];
      cacheTrade({ id: openTradeDetailId, from: base.from, to: base.to, type: base.type, stub: true });
    }
    // Fallback: attempt server fetch (Missing Data Guard)
  (async () => {
      try {
    // Prefer configured backend; otherwise use relative path (dev proxy handles /trade)
    const be = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
    const prefix = be ? be.replace(/\/+$/, '') : '';
    const url = `${prefix}/trade/${encodeURIComponent(lobbyId)}/${encodeURIComponent(openTradeDetailId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data && data.trade) {
            cacheTrade({ ...data.trade, id: openTradeDetailId, fetched: true });
          }
        }
      } catch (err) {
        // Silent network failure; UI will show unavailable state
      }
    })();
  }, [openTradeDetailId, snapshot.log]);

  function act(type: string, payload: any = {}) {
    s.emit('game_action', { id: lobbyId, action: { type, ...payload } });
  }

  const myTurn = equalNames(snapshot.players[snapshot.current_turn]?.name || '', myName);
  const rolledThisTurn = !!snapshot.rolled_this_turn;
  // List of other players you can trade with
  const otherPlayers = useMemo(() => (snapshot.players || []).filter(p => !equalNames(p.name, myName)), [snapshot.players, myName]);
  // If no partner selected, auto-set to the first other player to avoid button lockout
  useEffect(() => {
    if (!selectedPartner && otherPlayers.length > 0) {
      setSelectedPartner(otherPlayers[0].name);
    }
  }, [selectedPartner, otherPlayers]);
  // Compute canBuy before effects use it
  const canBuy = useMemo(() => {
    if (!myTurn) return false;
    const la: any = snapshot.last_action;
    if (["landed_on_unowned", "offer_buy", "can_buy"].includes(String(la?.type || ''))) return true;
    // fallback heuristic: if on a buyable tile with a price and no owner
    const pos = myPlayer?.position ?? -1;
    if (pos < 0) return false;
    const t = tiles[pos];
    if (!t) return false;
    if (!["property", "railroad", "utility"].includes(String(t.type))) return false;
    if (!t.price || t.price <= 0) return false;
    const prop: any = (snapshot.properties as any)?.[pos];
    return !prop || !prop.owner;
  }, [myTurn, snapshot.last_action, myPlayer?.position, tiles, snapshot.properties]);
  // Persist toggles
  useEffect(() => { localStorage.setItem('auto.roll', autoRoll ? '1' : '0'); }, [autoRoll]);
  useEffect(() => { localStorage.setItem('auto.buy', autoBuy ? '1' : '0'); }, [autoBuy]);
  useEffect(() => { localStorage.setItem('auto.end', autoEnd ? '1' : '0'); }, [autoEnd]);
  useEffect(() => { localStorage.setItem('auto.houses', autoHouses ? '1' : '0'); }, [autoHouses]);
  useEffect(() => { localStorage.setItem('auto.mortgage', autoMortgage ? '1' : '0'); }, [autoMortgage]);
  useEffect(() => { localStorage.setItem('auto.minKeep', String(Number.isFinite(minKeep) ? minKeep : 0)); }, [minKeep]);
  useEffect(() => { localStorage.setItem('auto.costRule', costRule); }, [costRule]);
  useEffect(() => { localStorage.setItem('auto.costValue', String(Number.isFinite(costValue) ? costValue : 0)); }, [costValue]);
  useEffect(() => { localStorage.setItem('auto.spread', autoSpread ? '1' : '0'); }, [autoSpread]);

  // Sync client auto-mortgage state with server player state (one-way: server -> client)
  useEffect(() => {
    const flag = (myPlayer as any)?.auto_mortgage;
    if (typeof flag === 'boolean' && flag !== autoMortgage) {
      setAutoMortgage(flag);
    }
  }, [myPlayer, autoMortgage]);

  // Handle auto-mortgage toggle and sync with server
  const handleAutoMortgageChange = (checked: boolean) => {
    setAutoMortgage(checked);
    act('toggle_auto_mortgage');
  };

  // Basic automation behaviors
  useEffect(() => {
    if (!myTurn || !autoRoll) return;
    // Continue rolling if allowed, regardless of non-blocking last_action like buy_denied
    const allow = myTurn && (!rolledThisTurn || (snapshot.rolls_left ?? 0) > 0);
    if (allow) {
      const t = setTimeout(() => {
        // Use the correct sound key so all clients have it loaded
        playGameSound('dice_rolled');
        act('roll_dice');
      }, 180);
      return () => clearTimeout(t);
    }
  }, [myTurn, autoRoll, rolledThisTurn, snapshot.rolls_left, snapshot.last_action]);
  useEffect(() => {
    if (!myTurn) return;
    const pos = myPlayer?.position ?? -1;
    if (!autoBuy || pos < 0) return;
    const t = tiles[pos];
    if (!t || !['property','railroad','utility'].includes(String(t.type))) return;
    const price = t.price || 0;
    const allowByCost = costRule === 'any' || (costRule === 'above' ? price >= costValue : price <= costValue);
    const allowByMin = (myPlayer?.cash ?? 0) - price >= (minKeep || 0);
    const prop: any = (snapshot.properties as any)?.[pos];
    const unowned = !prop || !prop.owner;
    if (unowned && allowByCost && allowByMin && canBuy) {
      playGameSound('purchase');
      act('buy_property');
    }
  }, [snapshot.last_action, myTurn, autoBuy, canBuy, minKeep, costRule, costValue, tiles, myPlayer?.position, myPlayer?.cash, snapshot.properties]);

  // Helper to find next house/hotel action candidate based on settings
  const nextHouseActionCandidate = useMemo(() => {
    if (!autoHouses || !myTurn) return null as null | { type: 'buy_house' | 'buy_hotel' | 'unmortgage', pos: number };
    // Build groups -> property positions I own (and group completeness)
    const allTiles: BoardTile[] = Object.values(tiles) as BoardTile[];
    const byGroup: Record<string, { positions: number[], allOwned: boolean, anyMortgaged: boolean, cost: number, mortgagedPositions: number[] }> = {};
    for (const t of allTiles) {
      if (!t || t.type !== 'property' || !t.group) continue;
      const st: any = (snapshot.properties as any)?.[t.pos] || {};
      const owner = st.owner;
      const mine = equalNames(owner || '', myName);
      if (!byGroup[t.group]) byGroup[t.group] = { positions: [], allOwned: true, anyMortgaged: false, cost: houseCostForGroup(t.group), mortgagedPositions: [] };
      byGroup[t.group].positions.push(t.pos);
      // Track ownership and mortgage status
      if (!mine) byGroup[t.group].allOwned = false;
      if (st.mortgaged) {
        byGroup[t.group].anyMortgaged = true;
        byGroup[t.group].mortgagedPositions.push(t.pos);
      }
    }
    
    // First priority: Check if we need to unmortgage properties in complete color sets
    for (const [group, info] of Object.entries(byGroup)) {
      if (!info.allOwned) continue;
      if (info.anyMortgaged && info.mortgagedPositions.length > 0) {
        // We own the complete set but some properties are mortgaged
        // Try to unmortgage the first one we can afford
        const budget = (myPlayer?.cash ?? 0);
        const keeps = Number.isFinite(minKeep) ? (minKeep || 0) : 0;
        
        for (const pos of info.mortgagedPositions) {
          const tile = tiles[pos];
          const unmortgageCost = Math.floor((tile?.price || 0) * 0.55); // 110% of mortgage value
          if ((budget - unmortgageCost) >= keeps) {
            console.log(`Auto-unmortgaging ${tile?.name} in ${group} for $${unmortgageCost} to enable house building`);
            return { type: 'unmortgage', pos: pos };
          }
        }
      }
    }
    
    // Second priority: Build houses on complete unmortgaged color sets
    const budget = (myPlayer?.cash ?? 0);
    const keeps = Number.isFinite(minKeep) ? (minKeep || 0) : 0;
    for (const [_group, info] of Object.entries(byGroup)) {
      if (!info.allOwned) continue;
      if (info.anyMortgaged) continue; // Skip if any are still mortgaged
      const hc = info.cost || 0;
      if (hc <= 0) continue;
      // Apply cost rule against house cost
      const allowCost = costRule === 'any' || (costRule === 'above' ? hc >= (costValue || 0) : hc <= (costValue || 0));
      if (!allowCost) continue;
      if ((budget - hc) < keeps) continue;
      // Determine per-tile counts (hotel counts as 5)
      const entries = info.positions.map((pos) => {
        const st: any = (snapshot.properties as any)?.[pos] || {};
        const houses = Math.max(0, Number(st.houses || 0));
        const hotel = !!st.hotel;
        const count = hotel ? 5 : houses;
        return { pos, houses, hotel, count };
      });
      // Auto-spread: choose the lowest count tile first
      if (autoSpread) {
        const min = Math.min(...entries.map(e => e.count));
        const candidates = entries.filter(e => e.count === min);
        // Prefer upgrading to hotel if already at 4 houses
        const hotelCand = candidates.find(e => e.houses === 4 && !e.hotel);
        if (hotelCand) return { type: 'buy_hotel', pos: hotelCand.pos };
        const houseCand = candidates.find(e => e.houses < 4 && !e.hotel);
        if (houseCand) return { type: 'buy_house', pos: houseCand.pos };
      } else {
        // Non-spread: try to upgrade to hotel first, then add houses up to 4
        const hotelCand = entries.find(e => e.houses === 4 && !e.hotel);
        if (hotelCand) return { type: 'buy_hotel', pos: hotelCand.pos };
        const houseCand = entries.find(e => e.houses < 4 && !e.hotel);
        if (houseCand) return { type: 'buy_house', pos: houseCand.pos };
      }
    }
    return null;
  }, [autoHouses, autoSpread, myTurn, tiles, snapshot.properties, myPlayer?.cash, minKeep, costRule, costValue, myName]);

  // Auto-buy houses/hotels one action per snapshot
  useEffect(() => {
    if (!myTurn || !autoHouses) return;
    const cand = nextHouseActionCandidate;
    if (!cand) return;
    const la: any = snapshot.last_action;
    if (la && typeof la.pos === 'number' && la.pos === (cand as any).pos && String(la.type || '').includes('denied')) return;
    // Final Keep $ override guard at execution time
    try {
      const pos = cand.pos;
      const tile = tiles[pos];
      const group = (tile as any)?.group as string | undefined;
      
      let cost = 0;
      if (cand.type === 'unmortgage') {
        // Unmortgage cost is 110% of mortgage value
        cost = Math.floor((tile?.price || 0) * 0.55);
      } else {
        // House/hotel cost
        cost = group ? houseCostForGroup(group) : 0;
      }
      
      const cash = myPlayer?.cash ?? 0;
      const keep = Number.isFinite(minKeep) ? (minKeep || 0) : 0;
      if (cost > 0 && (cash - cost) < keep) return; // do not execute if it violates Keep $
    } catch {}
    act(cand.type, { pos: cand.pos });
  }, [myTurn, autoHouses, nextHouseActionCandidate, snapshot.last_action]);
  // Auto-mortgage retry state
  const autoMortgageRetryRef = useRef<number>(0);
  const lastCashRef = useRef<number>(0);
  const autoEndTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const currentCash = myPlayer?.cash ?? 0;
    lastCashRef.current = currentCash;
    
    // Reset retry counter if cash becomes positive
    if (currentCash >= 0) {
      autoMortgageRetryRef.current = 0;
    }
  }, [myPlayer?.cash]);

  // Track cash changes for players to trigger a quick pulse animation
  const prevCashRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const map: Record<string, number> = prevCashRef.current || {};
    (snapshot.players || []).forEach(p => {
      const prev = map[p.name];
      if (typeof prev === 'number' && prev !== p.cash) {
        const cls = p.cash > prev ? 'money-up' : 'money-down';
        setMoneyAnimations(prevAnim => ({ ...prevAnim, [p.name]: cls }));
        setTimeout(() => setMoneyAnimations(prevAnim => ({ ...prevAnim, [p.name]: '' })), 450);
      }
      map[p.name] = p.cash;
    });
    prevCashRef.current = map;
  }, [snapshot.players]);

  useEffect(() => {
    // Check for negative cash regardless of turn (important for lag situations)
    const currentCash = myPlayer?.cash ?? 0;
    if (currentCash < 0 && autoMortgage && autoMortgageRetryRef.current < 3) { // Reduced from 5 to 3 retries
      const timeoutDelay = 500 + (autoMortgageRetryRef.current * 500); // Increased delays: 500ms, 1000ms, 1500ms
      const timer = setTimeout(() => {
        autoMortgageRetryRef.current++;
        console.log(`Client-side auto-mortgage retry ${autoMortgageRetryRef.current}: debt $${Math.abs(currentCash)}`);
        tryAutoMortgage();
      }, timeoutDelay);
      return () => clearTimeout(timer);
    }
  }, [myPlayer?.cash, autoMortgage, snapshot.last_action]);

  useEffect(() => {
    // Clear any existing auto-end timer
    if (autoEndTimerRef.current) {
      clearTimeout(autoEndTimerRef.current);
      autoEndTimerRef.current = null;
    }
    
    if (!myTurn) return;
    // If auto-houses has an action pending, let it run first
    if (autoHouses && nextHouseActionCandidate) return;
    
    // Don't auto-end turn if player has negative cash (let auto-mortgage work)
    const currentCash = myPlayer?.cash ?? 0;
    if (currentCash < 0 && autoMortgage) {
      console.log('Skipping auto-end turn: negative cash, waiting for auto-mortgage');
      return;
    }
    
    const rollsZero = (snapshot.rolls_left ?? 0) === 0;
    const la: any = snapshot.last_action;
    const rolledFlag = rolledThisTurn || (la && la.type === 'rolled' && equalNames(la.by || '', myName || ''));
    if (autoEnd && myTurn && rollsZero && rolledFlag) {
      // Add a small delay to ensure server state has fully synchronized
      autoEndTimerRef.current = setTimeout(() => {
        // Double-check conditions after delay to ensure sync
        const finalCash = myPlayer?.cash ?? 0;
        if (myTurn && rollsZero && (finalCash >= 0 || !autoMortgage)) {
          console.log('Auto-ending turn after sync delay');
          playGameSound('notification');
          act('end_turn');
        }
        autoEndTimerRef.current = null;
      }, 300); // 300ms delay for sync
      
      return () => {
        if (autoEndTimerRef.current) {
          clearTimeout(autoEndTimerRef.current);
          autoEndTimerRef.current = null;
        }
      };
    }
  }, [myTurn, autoEnd, rolledThisTurn, snapshot.rolls_left, autoHouses, nextHouseActionCandidate, snapshot.last_action, myPlayer?.cash, autoMortgage]);

  function tryAutoMortgage() {
    const currentCash = myPlayer?.cash ?? 0;
    const deficit = Math.abs(currentCash);
    if (currentCash >= 0) return; // No debt

    console.log(`Client auto-mortgage attempt ${autoMortgageRetryRef.current + 1}: need $${deficit}`);

    // First try to sell houses (highest value first)
    const ownedWithHouses = Object.entries(snapshot.properties || {})
      .map(([pos, st]: any) => ({ pos: Number(pos), st, tile: tiles[Number(pos)] }))
      .filter(x => equalNames(x.st.owner || '', myName) && (x.st.houses || 0) > 0 && !x.st.hotel)
      .sort((a, b) => {
        const costA = a.tile?.group ? houseCostForGroup(a.tile.group) : 0;
        const costB = b.tile?.group ? houseCostForGroup(b.tile.group) : 0;
        return costB - costA;
      });
    
    if (ownedWithHouses.length > 0) {
      const prop = ownedWithHouses[0];
      const houseCost = prop.tile?.group ? houseCostForGroup(prop.tile.group) : 0;
      console.log(`Client auto-selling house on ${prop.tile?.name} for $${houseCost / 2}`);
      act('sell_house', { pos: prop.pos });
      return;
    }

    // Then try to mortgage properties (highest value first, but must have no houses)
    const mortgageableProps = Object.entries(snapshot.properties || {})
      .map(([pos, st]: any) => ({ pos: Number(pos), st, tile: tiles[Number(pos)] }))
      .filter(x => {
        if (!equalNames(x.st.owner || '', myName)) return false;
        if (x.st.mortgaged) return false;
        if ((x.st.houses || 0) > 0 || x.st.hotel) return false;
        
        // Additional check: ensure the entire color group has no houses
        const group = x.tile?.group;
        if (group) {
          const groupProps = Object.entries(snapshot.properties || {})
            .map(([p, s]: any) => ({ pos: Number(p), st: s, tile: tiles[Number(p)] }))
            .filter(gp => gp.tile?.group === group);
          
          const hasHousesInGroup = groupProps.some(gp => (gp.st.houses || 0) > 0 || gp.st.hotel);
          if (hasHousesInGroup) {
            console.log(`Skipping ${x.tile?.name} - color group ${group} has houses`);
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => (b.tile?.price || 0) - (a.tile?.price || 0));
    
    if (mortgageableProps.length > 0) {
      const prop = mortgageableProps[0];
      const mortgageValue = Math.floor((prop.tile?.price || 0) / 2);
      console.log(`Client auto-mortgaging ${prop.tile?.name} for $${mortgageValue}`);
      act('mortgage', { pos: prop.pos });
      return;
    }

    console.log('Client auto-mortgage: No houses to sell or properties to mortgage');
    console.log('Properties owned:', Object.entries(snapshot.properties || {})
      .filter(([_, st]: any) => equalNames(st.owner || '', myName))
      .map(([pos, st]: any) => `${tiles[Number(pos)]?.name}: houses=${st.houses || 0}, mortgaged=${st.mortgaged}`));
  }

  // lastDice removed from UI

  // (Incoming/outgoing trades are selected directly in JSX when rendering the modal)

  // Auto-scroll log to bottom when opened and when it changes while open
  useEffect(() => {
    if (showLog && logRef.current) {
      const el = logRef.current;
      // Scroll after render
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [showLog, snapshot.log]);

  // Compact sidebar derived lists
  const allTrades = snapshot.pending_trades || [];
  const concise = (t: any) => {
    // Handle rental-type trades
    if (t?.type === 'rental') {
      const propCount = (t?.properties || []).length;
      return `💰$${t?.cash_amount || 0} ↔ 🏠${propCount}prop ${t?.percentage || 0}% rent (${t?.turns || 0}t)`;
    }
    
    // Handle traditional trades
    const giveCash = t?.give?.cash || 0; const recvCash = t?.receive?.cash || 0;
    const giveProps = (t?.give?.properties || []).length; const recvProps = (t?.receive?.properties || []).length;
    const jail = (t?.give?.jail_card ? '🪪→' : '') + (t?.receive?.jail_card ? '🪪←' : '');
    const cash = giveCash || recvCash ? `$${giveCash}↔$${recvCash}` : '';
    const props = giveProps || recvProps ? `P${giveProps}↔P${recvProps}` : '';
    return [cash, props, jail].filter(Boolean).join(' ');
  };

  return (
    <div className="actions actions-panel" style={{ position: 'relative' }}>
    {kickStatus?.target ? (
        <div className="ui-sm" style={{ position: 'absolute', right: 0, top: -20, color: '#c0392b' }}>
      Vote-kick: {normalizeName(String(kickStatus.target))} — {typeof kickStatus.remaining === 'number' ? `${Math.floor((kickStatus.remaining as number)/60)}:${String((kickStatus.remaining as number)%60).padStart(2,'0')}` : ''}
        </div>
      ) : null}

  {/* Players Overview — visible at top of Action Panel */}
      <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div className="ui-title ui-h3" style={{ textAlign: 'center' }}>Players Overview</div>
        <div style={{ fontSize: 12, marginTop: 6, display: 'grid', gap: 4 }}>
          {(snapshot.players || []).map((p, i) => {
            const isCurrent = i === (snapshot.current_turn ?? -1);
            const remain = disconnectRemainMap[p.name];
            const isDisc = typeof remain === 'number' && remain > 0;
            const meName = myName;
            return (
              <div
                key={p.name}
                className={`list-item${isCurrent ? ' current' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || 'var(--muted)', display: 'inline-block' }} />
                <button
                  className="btn btn-link"
                  style={{ padding: 0, lineHeight: 1, height: 'auto', fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => window.dispatchEvent(new CustomEvent('highlight-player', { detail: { name: p.name } }))}
                  title="Highlight rents for this player's properties"
                >
                  {normalizeName(p.name)}
                </button>
                {isDisc && (
                  <span
                    title={`Player disconnected - ${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')} remaining`}
                    className="badge"
                    style={{ background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.4)', color: '#e74c3c' }}
                  >
                    ⏱ {Math.max(0, Math.floor(remain))}s
                  </span>
                )}
                {/* Kick button to the LEFT of cash value */}
                {/* Spacer to push controls/cash to the right */}
                <span style={{ marginLeft: 'auto' }} />
                {isCurrent && p.name !== meName ? (
                  <button
                    className="btn btn-ghost"
                    title={`Vote to kick ${p.name}`}
                    style={{ padding: '0 6px', fontSize: 11 }}
                    onClick={() => s.emit('vote_kick', { id: lobbyId, target: p.name })}
                  >
                    Kick
                  </button>
                ) : null}
                <span className={moneyAnimations[p.name] || ''} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ${p.cash}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Single entry point to the new Dashboard (centered between sections) */}
      <div className="ui-labelframe" style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
        <button className="btn" onClick={() => setShowDashboard(true)} style={{ minWidth: 180 }}>📊 Dashboard</button>
      </div>
      <DashboardModal open={showDashboard} onClose={() => setShowDashboard(false)} lobbyId={lobbyId} snapshot={snapshot} />

  {/* Dice moved to GameBoard center */}

  {showTrade ? (
    <TradePanel
      lobbyId={lobbyId}
      snapshot={snapshot}
      variant="properties"
      initialPartner={selectedPartner || otherPlayers[0]?.name || ''}
      onClose={() => setShowTrade(false)}
    />
  ) : null}
  {showTradeAdvanced ? (
    <TradePanel
      lobbyId={lobbyId}
      snapshot={snapshot}
      variant="advanced"
      initialPartner={selectedPartner || otherPlayers[0]?.name || ''}
      onClose={() => setShowTradeAdvanced(false)}
    />
  ) : null}

  {showTrades ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowTrades(false)}>
          <div style={{ background: 'var(--color-surface)', minWidth: 420, maxWidth: '85vw', borderRadius: 8, padding: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>📬 Pending Trades</h3>
              <button className="btn btn-ghost" onClick={() => setShowTrades(false)}>❌ Close</button>
            </div>
            <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
              <div>
                <h4 style={{ margin: '6px 0' }}>Incoming</h4>
  {(snapshot.pending_trades || []).filter(t => equalNames(t.to, myName)).map((t) => (
                  <div key={t.id} className="card" style={{ padding: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <TradeHeader snapshot={snapshot} from={t.from} to={t.to} id={t.id} />
                      <button className="btn btn-ghost" onClick={() => openTradeDetail(String(t.id))} title="View details" aria-label={`View trade #${t.id}`} style={{ padding: '2px 6px' }}>👁️</button>
                    </div>
                    <TradeSummary t={t} tiles={tiles} />
                    {t.terms?.payments?.length ? (
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Recurring payments</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {t.terms.payments.map((p: any, i: number) => (
                            <li key={i}>{normalizeName(p.from)} pays ${p.amount} to {normalizeName(p.to)} for {p.turns} turns</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {t.terms?.rentals?.length ? (
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>🏠 Rental Agreements</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {t.terms.rentals.map((r: any, i: number) => {
                            const propNames = (r.properties || []).map((pos: number) => {
                              const tile = tiles[pos];
                              return tile?.name || `Property ${pos}`;
                            }).join(', ');
                            const direction = r.direction === 'give' ? 
                              `${normalizeName(t.from)} rents out to ${normalizeName(t.to)}` : 
                              `${normalizeName(t.from)} rents from ${normalizeName(t.to)}`;
                            return (
                              <li key={i}>
                                {direction}: {r.percentage}% of rent from {propNames} for {r.turns} turns
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button className="btn" onClick={() => act('accept_trade', { trade_id: t.id })} disabled={!equalNames(t.to, myName)}>Accept</button>
                      <button className="btn" onClick={() => act('decline_trade', { trade_id: t.id })}>Decline</button>
                    </div>
                  </div>
                ))}
                {(snapshot.pending_trades || []).filter(t => equalNames(t.to, myName)).length === 0 && <div style={{ opacity: 0.7 }}>No incoming trades.</div>}
              </div>
              <div>
                <h4 style={{ margin: '6px 0' }}>My Offers</h4>
  {(snapshot.pending_trades || []).filter(t => equalNames(t.from, myName)).map((t) => (
                  <div key={t.id} className="card" style={{ padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <TradeHeader snapshot={snapshot} from={t.from} to={t.to} id={t.id} />
            <button className="btn btn-ghost" onClick={() => openTradeDetail(String(t.id))} title="View details" aria-label={`View trade #${t.id}`} style={{ padding: '2px 6px' }}>👁️</button>
          </div>
                    <TradeSummary t={t} tiles={tiles} />
                    {t.terms?.payments?.length ? (
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Recurring payments</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {t.terms.payments.map((p: any, i: number) => (
                            <li key={i}>{normalizeName(p.from)} pays ${p.amount} to {normalizeName(p.to)} for {p.turns} turns</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {t.terms?.rentals?.length ? (
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>🏠 Rental Agreements</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {t.terms.rentals.map((r: any, i: number) => {
                            const propNames = (r.properties || []).map((pos: number) => {
                              const tile = tiles[pos];
                              return tile?.name || `Property ${pos}`;
                            }).join(', ');
                            const direction = r.direction === 'give' ? 
                              `${normalizeName(t.from)} rents out to ${normalizeName(t.to)}` : 
                              `${normalizeName(t.from)} rents from ${normalizeName(t.to)}`;
                            return (
                              <li key={i}>
                                {direction}: {r.percentage}% of rent from {propNames} for {r.turns} turns
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button className="btn" onClick={() => act('cancel_trade', { trade_id: t.id })}>Cancel</button>
                    </div>
                  </div>
                ))}
                {(snapshot.pending_trades || []).filter(t => equalNames(t.from, myName)).length === 0 && <div style={{ opacity: 0.7 }}>No outgoing trades.</div>}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showLog ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowLog(false)}>
          <div style={{ background: 'var(--color-surface)', minWidth: 420, maxWidth: '85vw', borderRadius: 8, padding: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>📜 Game Log</h3>
              <button className="btn btn-ghost" onClick={() => setShowLog(false)}>❌ Close</button>
            </div>
            <div style={{ marginTop: 8 }}>
              <LogFilters value={logFilters} onChange={setLogFilters} />
            </div>
            <div ref={logRef} style={{ fontSize: 12, marginTop: 8, maxHeight: '60vh', overflow: 'auto' }}>
              {snapshot.log && snapshot.log.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {(snapshot.log as any[]).filter((e) => filterLogEntry(e, logFilters)).map((e: any, i: number) => (
                    <li key={i} style={{ padding: '4px 0', borderBottom: '1px dashed #eee' }}>
                      <span style={{ marginRight: 6 }}>
                        {e.type === 'rolled' ? '🎲' : e.type === 'buy' ? '🏠' : e.type === 'end_turn' ? '⏭' : e.type === 'bankrupt' ? '💥' : '•'}
                      </span>
                      {e.id && /^trade_/.test(String(e.type)) ? (
                        <button className="btn btn-link" style={{ padding: 0 }} onClick={() => { openTradeDetail(String(e.id)); setShowLog(false); }} title={`Open trade ${e.id}`}>{e.text || JSON.stringify(e)}</button>
                      ) : (
                        <span>{e.text || JSON.stringify(e)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <div>No log entries yet.</div>}
            </div>
          </div>
        </div>
      ) : null}

      {/* Compact Pending Trades (panel height reduced, inline metadata, overflow guard) */}
      <div className="ui-labelframe" style={{ marginBottom: 8, display: 'none' }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="ui-title ui-h3" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            📬 Pending
            {allTrades.length > 0 && <span className="badge badge-info" style={{ fontSize: 10 }}>{allTrades.length}</span>}
          </div>
          {allTrades.length > 0 && <button className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={() => setShowTrades(true)}>List ▸</button>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
          {allTrades.length === 0 ? <div className="ui-sm" style={{ opacity: 0.65 }}>None</div> : null}
          {allTrades.slice(-8).reverse().map((t: any) => {
            const mineFrom = equalNames(t.from, myName);
            const mineTo = equalNames(t.to, myName);
            const brief = concise(t) || '—';
            const statusBadge = mineTo ? 'incoming' : (mineFrom ? 'outgoing' : 'watch');
            const badgeColor = mineTo ? '#27ae60' : (mineFrom ? '#2980b9' : '#7f8c8d');
            const [expanded, setExpanded] = [openInline.has(t.id), (val: boolean) => setOpenInline(prev => { const n = new Set(prev); if (val) n.add(t.id); else n.delete(t.id); return n; })];
            return (
              <div key={t.id} style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: '4px 6px', display: 'flex', flexDirection: 'column', fontSize: 11 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => setExpanded(!expanded)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12 }} title={expanded ? 'Collapse' : 'Expand'}>{expanded ? '▾' : '▸'}</button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.from}>{normalizeName(t.from)}</span>
                    <span style={{ opacity: 0.75 }}>→</span>
                    <span style={{ fontWeight: 600, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.to}>{normalizeName(t.to)}</span>
                  </div>
                  <span style={{ justifySelf: 'end', fontSize: 9, padding: '1px 4px', borderRadius: 4, background: badgeColor, color: '#fff' }}>{statusBadge}</span>
                  <button className="btn btn-ghost" onClick={() => openTradeDetail(String(t.id))} title="View details" aria-label={`View trade #${t.id}`} style={{ padding: '0 6px', lineHeight: 1 }}>
                    👁️
                  </button>
                  <div style={{ gridColumn: '1 / -1', fontSize: 10, lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.85 }} title={brief}>{brief}</div>
                </div>
                {expanded && (
                  <div style={{ marginTop: 4, fontSize: 10, display: 'grid', gap: 2 }}>
                    {t.type === 'rental' ? (
                      <div>Rental: ${t.cash_amount || 0} • {(t.properties || []).length} props • {t.percentage || 0}% • {t.turns || 0}t</div>
                    ) : (
                      <>
                        <div>Cash: {(t.give?.cash || 0)} ↔ {(t.receive?.cash || 0)}</div>
                        <div>Give: {(t.give?.properties || []).length ? (t.give?.properties || []).map((pos: number) => tiles[pos]?.name || `#${pos}`).join(', ') : '—'}</div>
                        <div>Receive: {(t.receive?.properties || []).length ? (t.receive?.properties || []).map((pos: number) => tiles[pos]?.name || `#${pos}`).join(', ') : '—'}</div>
                        {(t.give?.jail_card || t.receive?.jail_card) && <div>Jail Card: {t.give?.jail_card ? 'give' : ''}{t.receive?.jail_card ? (t.give?.jail_card ? ' & receive' : 'receive') : ''}</div>}
                      </>
                    )}
                    {t.terms?.payments?.length ? <div>Payments: {t.terms.payments.length}</div> : null}
                    {t.terms?.rentals?.length ? <div>Rentals: {t.terms.rentals.length}</div> : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Automation toggles — visible */}
      <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div className="ui-title ui-h3" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            ⚙️ Auto Actions {autoRoll || autoBuy || autoEnd || autoHouses || autoMortgage ? <span style={{ fontSize: 10, padding: '2px 6px', background: '#3498db', color: '#fff', borderRadius: 4 }}>ON</span> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }} title="Turn all auto settings on" onClick={() => { setAutoRoll(true); setAutoBuy(true); setAutoEnd(true); setAutoHouses(true); setAutoMortgage(true); setAutoSpread(true); }}>All On</button>
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }} title="Turn all auto settings off" onClick={() => { setAutoRoll(false); setAutoBuy(false); setAutoEnd(false); setAutoHouses(false); setAutoMortgage(false); setAutoSpread(false); }}>All Off</button>
            <button className="btn btn-ghost" style={{ padding: '2px 8px' }} aria-expanded={!collapseAuto} aria-controls="auto-section" onClick={() => setCollapseAuto(c => !c)}>{collapseAuto ? '➕' : '➖'}</button>
          </div>
        </div>
  <div id="auto-section" aria-hidden={collapseAuto} className={`animate-fade-in collapsible ${collapseAuto ? 'closed' : 'open'}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 6, overflowY: 'auto', paddingRight: 2 }}>
            <label style={{ fontSize: 11 }}><input type="checkbox" checked={autoRoll} onChange={(e) => setAutoRoll(e.target.checked)} /> Roll</label>
            <label style={{ fontSize: 11 }}><input type="checkbox" checked={autoBuy} onChange={(e) => setAutoBuy(e.target.checked)} /> Buy Props</label>
            <label style={{ fontSize: 11 }}><input type="checkbox" checked={autoEnd} onChange={(e) => setAutoEnd(e.target.checked)} /> End Turn</label>
            <label style={{ fontSize: 11 }} title="Buy houses/hotels automatically"><input type="checkbox" checked={autoHouses} onChange={(e) => setAutoHouses(e.target.checked)} /> Houses/Hotels</label>
            <label style={{ fontSize: 11 }} title="Auto-mortgage properties when needed for purchases"><input type="checkbox" checked={autoMortgage} onChange={(e) => handleAutoMortgageChange(e.target.checked)} /> Auto Mortgage</label>
            <label style={{ fontSize: 11 }}>Keep $<input type="number" min={0} value={minKeep} onChange={(e) => setMinKeep(parseInt(e.target.value || '0', 10))} style={{ width: 60, marginLeft: 2 }} /></label>
            <label style={{ fontSize: 11 }}>Cost <select value={costRule} onChange={(e) => setCostRule(e.target.value as any)} style={{ marginLeft: 2 }}>
              <option value="any">any</option>
              <option value="above">≥</option>
              <option value="below">≤</option>
            </select> <input type="number" min={0} value={costValue} onChange={(e) => setCostValue(parseInt(e.target.value || '0', 10))} style={{ width: 60 }} /></label>
            <label style={{ fontSize: 11 }} title="Evenly distribute houses"><input type="checkbox" checked={autoSpread} onChange={(e) => setAutoSpread(e.target.checked)} /> Spread Houses</label>
        </div>
      </div>

            {openTradeDetailId ? (() => {
              const cache = tradeCacheRef.current;
              const trade: any = cache.get(openTradeDetailId) || (snapshot.pending_trades || []).find((t: any) => String(t.id) === openTradeDetailId);
              const navIds = tradeOrderRef.current;
              const idx = navIds.indexOf(openTradeDetailId);
              const prevId = idx > 0 ? navIds[idx - 1] : null;
              const nextId = idx >= 0 && idx < navIds.length - 1 ? navIds[idx + 1] : null;
              // Determine status from latest log entry referencing this id
              const relatedLogs = (snapshot.log || []).filter((e: any) => String(e.id) === openTradeDetailId);
              const latest = relatedLogs[relatedLogs.length - 1];
              const status = latest ? latest.type : (trade ? 'trade_offer' : 'unknown');
              const isPending = (snapshot.pending_trades || []).some((p: any) => String(p.id) === String(openTradeDetailId));
              const iAmRecipient = !!trade && equalNames(String(trade.to || ''), String(myName));
              const iAmSender = !!trade && equalNames(String(trade.from || ''), String(myName));
        return (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={closeTradeDetail}>
                  <div style={{ background: 'var(--color-surface)', minWidth: 460, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', borderRadius: 10, padding: 16, boxShadow: '0 4px 16px var(--color-shadow)' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>📄 Trade #{openTradeDetailId}</h3>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" disabled={!prevId} onClick={() => prevId && openTradeDetail(prevId)} title={prevId ? `Prev (#${prevId})` : 'No previous'}>⬅️</button>
                        <button className="btn btn-ghost" disabled={!nextId} onClick={() => nextId && openTradeDetail(nextId)} title={nextId ? `Next (#${nextId})` : 'No next'}>➡️</button>
                        <button className="btn btn-ghost" onClick={closeTradeDetail}>❌</button>
                      </div>
                    </div>
                    {!trade ? (
                      <div style={{ marginTop: 12 }}>Trade details unavailable (may have occurred before you joined).</div>
                    ) : (
                      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong>{normalizeName(trade.from || '???')}</strong>
                          <span style={{ opacity: 0.7 }}>→</span>
                          <strong>{normalizeName(trade.to || '???')}</strong>
                          <span style={{ fontSize: 12, padding: '2px 6px', background: '#eee', borderRadius: 4 }}>{status}</span>
                          {trade.stub ? <span style={{ fontSize: 11, opacity: 0.6 }}>(reconstructed)</span> : null}
                        </div>
                        {trade.type === 'rental' || trade.cash_amount != null ? (
                          <div className="ui-sm" style={{ lineHeight: 1.4 }}>
                            <div><strong>Rental Offer</strong></div>
                            <div>Cash: ${trade.cash_amount || 0}</div>
                            <div>Properties: {(trade.properties || []).map((pos: number) => tiles[pos]?.name || `#${pos}`).join(', ') || '—'}</div>
                            <div>Percentage: {trade.percentage || 0}% • Turns: {trade.turns || 0}</div>
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                            <div><strong>Give Cash:</strong> ${(trade.give?.cash || 0)}</div>
                            <div><strong>Receive Cash:</strong> ${(trade.receive?.cash || 0)}</div>
                            <div><strong>Give Props:</strong> {(trade.give?.properties || []).length ? (trade.give?.properties || []).map((pos: number) => tiles[pos]?.name || `#${pos}`).join(', ') : '—'}</div>
                            <div><strong>Receive Props:</strong> {(trade.receive?.properties || []).length ? (trade.receive?.properties || []).map((pos: number) => tiles[pos]?.name || `#${pos}`).join(', ') : '—'}</div>
                            {trade.give?.jail_card ? <div>Includes: Give Get Out of Jail Free</div> : null}
                            {trade.receive?.jail_card ? <div>Includes: Receive Get Out of Jail Free</div> : null}
                          </div>
                        )}
                        {trade.terms?.payments?.length ? (
                          <div style={{ fontSize: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Recurring Payments</div>
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {trade.terms.payments.map((p: any, i: number) => <li key={i}>{normalizeName(p.from)} pays ${p.amount} to {normalizeName(p.to)} for {p.turns} turns</li>)}
                            </ul>
                          </div>
                        ) : null}
                        {trade.terms?.rentals?.length ? (
                          <div style={{ fontSize: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Property Rentals</div>
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {trade.terms.rentals.map((r: any, i: number) => (
                                <li key={i}>{r.percentage}% of rent from {(r.properties || []).map((pos: number) => tiles[pos]?.name || `#${pos}`).join(', ') || '—'} ({r.turns} turns)</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <div style={{ fontSize: 11, opacity: 0.65 }}>
                          {relatedLogs.length ? `${relatedLogs.length} related events` : 'No related log events in current buffer'} • {trade?.fetched ? 'fetched' : trade?.stub ? 'reconstructed' : 'cached'}
                        </div>
                        {isPending ? (
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            {iAmRecipient ? (
                              <>
                                <button className="btn" onClick={() => act('accept_trade', { trade_id: trade.id })}>Accept</button>
                                <button className="btn" onClick={() => act('decline_trade', { trade_id: trade.id })}>Decline</button>
                              </>
                            ) : null}
                            {iAmSender ? (
                              <button className="btn" onClick={() => act('cancel_trade', { trade_id: trade.id })}>Cancel</button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : null}

      {/* Recurring obligations summary */}
      <div className="ui-labelframe" style={{ marginBottom: 8, display: 'none' }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="ui-title ui-h3">📆 Recurring Payments</div>
    <button className="btn btn-ghost" style={{ padding: '2px 8px' }} aria-expanded={!collapseRecurring} aria-controls="recurring-section" onClick={() => setCollapseRecurring(c => !c)}>{collapseRecurring ? '➕' : '➖'}</button>
        </div>
  <div id="recurring-section" aria-hidden={collapseRecurring} className={`ui-sm animate-fade-in collapsible ${collapseRecurring ? 'closed' : 'open'}`} style={{ display: 'grid', gap: 4 }}>
      {((snapshot as any).recurring || []).length === 0 ? (
            <div style={{ opacity: 0.7 }}>None</div>
          ) : ((snapshot as any).recurring || []).map((r: any, idx: number) => (
            <div key={idx}>
        {normalizeName(r.from)} → {normalizeName(r.to)}: ${r.amount} ({r.turns_left} turns left)
            </div>
          ))}
        </div>
      </div>

      {/* Property Rental Agreements */}
      <div className="ui-labelframe" style={{ marginBottom: 8, display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="ui-title ui-h3">🏠 Property Rentals</div>
    <button className="btn btn-ghost" style={{ padding: '2px 8px' }} aria-expanded={!collapseRentals} aria-controls="rentals-section" onClick={() => setCollapseRentals(c => !c)}>{collapseRentals ? '➕' : '➖'}</button>
        </div>
  <div id="rentals-section" aria-hidden={collapseRentals} className={`ui-sm animate-fade-in collapsible ${collapseRentals ? 'closed' : 'open'}`} style={{ display: 'grid', gap: 4 }}>
          {((snapshot as any).property_rentals || []).length === 0 ? (
            <div style={{ opacity: 0.7 }}>None</div>
          ) : ((snapshot as any).property_rentals || []).map((rental: any, idx: number) => {
            const propertyNames = rental.properties?.map((pos: number) => {
              const tile = tiles[pos] || { name: `Property ${pos}` };
              return tile.name;
            }).join(', ') || 'Properties';
            
            const totalReceived = rental.total_received || 0;
            const lastPayment = rental.last_payment || 0;
            return (
              <div key={idx} style={{ 
                fontSize: '1em',
                fontWeight: 'bold',
                color: 'var(--color-text)'
              }}>
                <div>
                  {normalizeName(rental.renter)} → {normalizeName(rental.owner)}: {rental.percentage}% rent from {propertyNames} (${totalReceived} received, {rental.turns_left} turns left)
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stocks (per-player) */}
      <div className="ui-labelframe" style={{ marginBottom: 8, display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="ui-title ui-h3">📈 Stocks</div>
          <button className="btn btn-ghost" onClick={() => setShowStockCharts(true)}>Charts</button>
        </div>
        <StocksList lobbyId={lobbyId} snapshot={snapshot} myName={myName} onOpen={(row) => setOpenStock(row)} />
      </div>
      <StockModal open={!!openStock} lobbyId={lobbyId} snapshot={snapshot} stock={openStock} onClose={() => setOpenStock(null)} />
      <StockChartsModal open={showStockCharts} snapshot={snapshot} lobbyId={lobbyId} onOpenStock={(row) => { setShowStockCharts(false); setOpenStock(row); }} onClose={() => setShowStockCharts(false)} />

      {/* Bonds — hidden in dashboard mode */}
      <div className="ui-labelframe" style={{ marginBottom: 8, display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="ui-title ui-h3">💵 Bonds</div>
          <button className="btn btn-ghost" onClick={() => setShowBondCharts(true)}>Charts</button>
        </div>
        <BondsList lobbyId={lobbyId} snapshot={snapshot} myName={myName} />
      </div>
  <BondChartsModal open={showBondCharts} snapshot={snapshot} onClose={() => setShowBondCharts(false)} />
    </div>
  );
}

function TradeSummary({ t, tiles }: { t: any, tiles?: Record<number, any> }) {
  const give = t.give || {}; const receive = t.receive || {};
  const name = (pos: number) => tiles?.[pos]?.name || `#${pos}`;
  const propsList = (arr?: number[]) => arr && arr.length ? arr.map((p) => name(p)).join(', ') : '-';
  const cashLine = (give.cash || 0) || (receive.cash || 0) ? `${give.cash || 0} ↔ ${receive.cash || 0}` : '-';
  return (
    <div style={{ fontSize: 13, marginTop: 6, display: 'grid', gap: 2 }}>
      <div><strong>Cash:</strong> {cashLine}</div>
      <div><strong>Give:</strong> {propsList(give.properties)}</div>
      <div><strong>Receive:</strong> {propsList(receive.properties)}</div>
      {give.jail_card ? <div>Includes: Give Get Out of Jail Free</div> : null}
      {receive.jail_card ? <div>Includes: Receive Get Out of Jail Free</div> : null}
    </div>
  );
}

function TradeHeader({ snapshot, from, to, id }: { snapshot: GameSnapshot, from: string, to: string, id: any }) {
  const f = (snapshot.players || []).find(p => equalNames(p.name, from));
  const t = (snapshot.players || []).find(p => equalNames(p.name, to));
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <span title={from} style={{ width: 10, height: 10, borderRadius: '50%', background: f?.color || '#999', display: 'inline-block' }} />
  <span style={{ fontWeight: 600 }}>{normalizeName(from)}</span>
        <span style={{ opacity: 0.7 }}>→</span>
  <span title={to} style={{ width: 10, height: 10, borderRadius: '50%', background: t?.color || '#999', display: 'inline-block' }} />
  <span style={{ fontWeight: 600 }}>{normalizeName(to)}</span>
      </div>
      <span style={{ opacity: 0.7 }}>#{id}</span>
    </div>
  );
}

function filterLogEntry(e: any, filters: Set<string>): boolean {
  if (!filters || filters.size === 0) return true;
  const t = String(e?.type || '');
  if (filters.has(t)) return true;
  // Grouped shortcuts
  if (filters.has('trade') && /^trade_/.test(t)) return true;
  if (filters.has('recurring') && /^recurring_/.test(t)) return true;
  return false;
}

function LogFilters({ value, onChange }: { value: Set<string>, onChange: (s: Set<string>) => void }) {
  const items = [
    { key: 'rolled', label: 'Rolls' },
    { key: 'buy', label: 'Buys' },
    { key: 'rent', label: 'Rent' },
    { key: 'tax', label: 'Tax' },
    { key: 'jail', label: 'Jail' },
    { key: 'trade', label: 'Trades' },
    { key: 'recurring', label: 'Recurring' },
    { key: 'end_turn', label: 'End Turns' },
    { key: 'bankrupt', label: 'Bankruptcy' },
  ];
  const toggle = (k: string) => {
    const next = new Set(value);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange(next);
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <label key={it.key} className="badge badge-muted" style={{ cursor: 'pointer' }}>
          <input type="checkbox" style={{ marginRight: 6 }} checked={value.has(it.key)} onChange={() => toggle(it.key)} />
          {it.label}
        </label>
      ))}
    </div>
  );
}

function StocksList({ lobbyId: _lobbyId, snapshot, myName, onOpen }: { lobbyId: string, snapshot: any, myName: string, onOpen: (row: any) => void }) {
  const stocks = (snapshot as any)?.stocks as Array<any> | undefined;
  if (!stocks || stocks.length === 0) return <div className="ui-sm" style={{ opacity: 0.7 }}>None</div>;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {stocks.map((o: any) => (
        <div key={o.owner} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8, border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span title={o.owner} style={{ width: 10, height: 10, borderRadius: '50%', background: o.owner_color || '#999', display: 'inline-block' }} />
            <strong>{normalizeName(o.owner)}</strong>
          </div>
          <div className="ui-sm" style={{ opacity: 0.9 }} title="Price is owner's current cash">
            {(() => {
              const ownerCash = (snapshot.players || []).find((p: any) => equalNames(p.name, o.owner))?.cash ?? 0;
              const mine = (o.holdings || []).find((h: any) => equalNames(h.investor, myName));
              const myPct = ((mine?.percent ?? 0) * 100).toFixed(2);
              return <>Price: ${ownerCash} • Mine: {myPct}%</>;
            })()}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {equalNames(o.owner, myName) ? (
              // Owner view: Settings icon only, no Open button
              <button className="btn btn-ghost" onClick={() => onOpen(o)} title="Stock Settings">⚙️</button>
            ) : (
              // Buyer view: Open button for trading
              <button className="btn" onClick={() => onOpen(o)}>Open</button>
            )}
          </div>
      {o.holdings && o.holdings.length > 0 ? (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, marginTop: 4 }}>
        Holders: {o.holdings.map((h: any) => `${normalizeName(h.investor)}(${Number(h.shares || 0).toFixed(3)})`).join(', ')}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BondsList({ lobbyId, snapshot, myName }: { lobbyId: string, snapshot: GameSnapshot, myName: string }) {
  const s = getSocket();
  const bonds: any[] = (snapshot as any)?.bonds || [];
  if (!bonds || bonds.length === 0) return <div className="ui-sm" style={{ opacity: 0.7 }}>None</div> as any;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {bonds.map((row: any, idx: number) => {
        const isOwner = equalNames(row.owner || '', myName || '');
        return (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8, border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span title={row.owner} style={{ width: 10, height: 10, borderRadius: '50%', background: row.owner_color || '#999', display: 'inline-block' }} />
              <strong>{normalizeName(row.owner)}</strong>
            </div>
            <div className="ui-sm" style={{ opacity: 0.9 }}>
              {row.allow_bonds ? `Rate: ${row.rate_percent || 0}% • Every ${row.period_turns || 1}t` : 'Disabled'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {isOwner ? (
                <>
                  <label className="ui-sm" title="Allow others to invest in your bond"><input type="checkbox" checked={!!row.allow_bonds} onChange={(e) => s.emit('game_action', { id: lobbyId, action: { type: 'bond_settings', allow_bonds: e.target.checked } })} /> Allow</label>
                  <label className="ui-sm">Rate %<input type="number" min={0} max={100} defaultValue={row.rate_percent || 0} onBlur={(e) => s.emit('game_action', { id: lobbyId, action: { type: 'bond_settings', rate_percent: parseFloat(e.target.value || '0') } })} style={{ width: 60, marginLeft: 4 }} /></label>
                  <label className="ui-sm">Period<input type="number" min={1} max={20} defaultValue={row.period_turns || 1} onBlur={(e) => s.emit('game_action', { id: lobbyId, action: { type: 'bond_settings', period_turns: parseInt(e.target.value || '1', 10) } })} style={{ width: 60, marginLeft: 4 }} /></label>
                </>
              ) : (
                <>
                  <button className="btn btn-ghost" disabled={!row.allow_bonds} onClick={() => s.emit('game_action', { id: lobbyId, action: { type: 'bond_invest', owner: row.owner, amount: 25 } })}>Invest $25</button>
                  <button className="btn btn-ghost" disabled={!row.allow_bonds} onClick={() => s.emit('game_action', { id: lobbyId, action: { type: 'bond_invest', owner: row.owner, amount: 50 } })}>$50</button>
                  <button className="btn btn-ghost" disabled={!row.allow_bonds} onClick={() => s.emit('game_action', { id: lobbyId, action: { type: 'bond_invest', owner: row.owner, amount: 100 } })}>$100</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  ) as any;
}
