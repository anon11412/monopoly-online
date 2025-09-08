import { useEffect, useMemo, useRef, useState } from 'react';
import { getSocket, getRemembered } from '../lib/socket';
import TradePanel from './TradePanel';
import type { GameSnapshot } from '../types';
import { buildDefaultBoardTiles } from '../lib/boardFallback';
import { houseCostForGroup } from '../lib/rentData';
import type { BoardTile } from '../types';
import StockModal from './StockModal';
import StockChartsModal from './StockChartsModal';

type Props = { lobbyId: string; snapshot: GameSnapshot };

export default function ActionPanel({ lobbyId, snapshot }: Props) {
  const s = getSocket();
  const me = snapshot.players?.[snapshot.current_turn];
  const myName = (getRemembered().displayName || '').trim() || (me?.name || '');
  const myPlayer = (snapshot.players || []).find(p => p.name === myName);
  const [showTrade, setShowTrade] = useState(false);
  const [showTradeAdvanced, setShowTradeAdvanced] = useState(false);
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
  const [, setOpenTradeId] = useState<string | null>(null);
  const [kickStatus, setKickStatus] = useState<{ target?: string | null; remaining?: number | null }>({});
  const [openStock, setOpenStock] = useState<any | null>(null);
  const [showStockCharts, setShowStockCharts] = useState(false);
  const [collapseAuto, setCollapseAuto] = useState(false);
  const [collapseRecurring, setCollapseRecurring] = useState(false);

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
    };
    s.on('lobby_state', onLobbyState);
    return () => { s.off('lobby_state', onLobbyState); };
  }, [s]);

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

  function act(type: string, payload: any = {}) {
    s.emit('game_action', { id: lobbyId, action: { type, ...payload } });
  }

  const myTurn = snapshot.players[snapshot.current_turn]?.name === myName;
  const rolledThisTurn = !!snapshot.rolled_this_turn;
  // List of other players you can trade with
  const otherPlayers = useMemo(() => (snapshot.players || []).filter(p => p.name !== myName), [snapshot.players, myName]);
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

  // Basic automation behaviors
  useEffect(() => {
    if (!myTurn || !autoRoll) return;
    // Continue rolling if allowed, regardless of non-blocking last_action like buy_denied
    const allow = myTurn && (!rolledThisTurn || (snapshot.rolls_left ?? 0) > 0);
    if (allow) {
      const t = setTimeout(() => act('roll_dice'), 180);
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
    if (unowned && allowByCost && allowByMin && canBuy) act('buy_property');
  }, [snapshot.last_action, myTurn, autoBuy, canBuy, minKeep, costRule, costValue, tiles, myPlayer?.position, myPlayer?.cash, snapshot.properties]);

  // Helper to find next house/hotel action candidate based on settings
  const nextHouseActionCandidate = useMemo(() => {
    if (!autoHouses || !myTurn) return null as null | { type: 'buy_house' | 'buy_hotel', pos: number };
    // Build groups -> property positions I own (and group completeness)
    const allTiles: BoardTile[] = Object.values(tiles) as BoardTile[];
    const byGroup: Record<string, { positions: number[], allOwned: boolean, anyMortgaged: boolean, cost: number }> = {};
    for (const t of allTiles) {
      if (!t || t.type !== 'property' || !t.group) continue;
      const st: any = (snapshot.properties as any)?.[t.pos] || {};
      const owner = st.owner;
      const mine = owner === myName;
      if (!byGroup[t.group]) byGroup[t.group] = { positions: [], allOwned: true, anyMortgaged: false, cost: houseCostForGroup(t.group) };
      byGroup[t.group].positions.push(t.pos);
      // Track ownership and mortgage status
      if (!mine) byGroup[t.group].allOwned = false;
      if (st.mortgaged) byGroup[t.group].anyMortgaged = true;
    }
    // Evaluate groups for next build
    const budget = (myPlayer?.cash ?? 0);
    const keeps = Number.isFinite(minKeep) ? (minKeep || 0) : 0;
  for (const [_group, info] of Object.entries(byGroup)) {
      if (!info.allOwned) continue;
      if (info.anyMortgaged) continue; // cannot build if any mortgaged in set
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
    act(cand.type, { pos: cand.pos });
  }, [myTurn, autoHouses, nextHouseActionCandidate, snapshot.last_action]);
  useEffect(() => {
    if (!myTurn) return;
    // If auto-houses has an action pending, let it run first
    if (autoHouses && nextHouseActionCandidate) return;
    // If negative cash, try auto-mortgage first if enabled
    if ((myPlayer?.cash ?? 0) < 0 && autoMortgage) {
      tryAutoMortgage();
      return;
    }
    if (autoEnd && (myTurn && rolledThisTurn && (snapshot.rolls_left ?? 0) === 0)) act('end_turn');
  }, [myTurn, autoEnd, rolledThisTurn, snapshot.rolls_left, autoHouses, nextHouseActionCandidate]);

  function tryAutoMortgage() {
    // Mortgage owned properties without buildings, lowest price first
    const owned = Object.entries(snapshot.properties || {})
      .map(([pos, st]: any) => ({ pos: Number(pos), st }))
      .filter(x => x.st.owner === myName && !x.st.mortgaged && (x.st.houses || 0) === 0 && !x.st.hotel);
    if (owned.length === 0) return;
    // sort by tile price ascending
    const arr = owned.sort((a, b) => (tiles[a.pos]?.price || 0) - (tiles[b.pos]?.price || 0));
    // fire one mortgage per tick
    act('mortgage', { pos: arr[0].pos });
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

  // Derive current tile info for Buy UI
  const currentTile = useMemo(() => {
    const pos = myPlayer?.position ?? -1;
    return pos >= 0 ? tiles[pos] : undefined;
  }, [myPlayer?.position, tiles]);

  // Compact sidebar derived lists
  const allTrades = snapshot.pending_trades || [];
  const concise = (t: any) => {
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
          Vote-kick: {kickStatus.target} — {typeof kickStatus.remaining === 'number' ? `${Math.floor((kickStatus.remaining as number)/60)}:${String((kickStatus.remaining as number)%60).padStart(2,'0')}` : ''}
        </div>
      ) : null}
  <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div className="ui-title ui-h3">Current Turn</div>
        <div className="ui-h3" style={{ marginTop: 6 }}>Turn: {snapshot.players?.[snapshot.current_turn || 0]?.name ?? '\u2014'}</div>
  {/* Roll/Buy/End buttons removed; use in-board controls instead */}
        {canBuy && currentTile ? (
          <div className="ui-sm" style={{ marginTop: 6, color: '#2c3e50' }}>
            You may buy <strong>{currentTile.name}</strong> for <strong>${currentTile.price ?? 0}</strong>.
          </div>
        ) : null}
        {(() => {
          const la: any = snapshot.last_action;
          if (la?.type === 'buy_failed' && myTurn) {
            const map: Record<string, string> = {
              not_buyable: 'Tile cannot be purchased.',
              owned: 'Already owned.',
              no_price: 'No price set.',
              insufficient_cash: 'Not enough cash.'
            };
            return <div className="ui-sm" style={{ marginTop: 6, color: '#c0392b' }}>Buy denied: {map[la.reason] || 'Not allowed'}</div>;
          }
          return null;
        })()}
      </div>

  {/* Dice moved to GameBoard center */}

  {/* Players Overview moved into GameBoard overlay; keeping the modal infrastructure here */}

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
          <div style={{ background: '#fff', minWidth: 420, maxWidth: '85vw', borderRadius: 8, padding: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>📬 Pending Trades</h3>
              <button className="btn btn-ghost" onClick={() => setShowTrades(false)}>❌ Close</button>
            </div>
            <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
              <div>
                <h4 style={{ margin: '6px 0' }}>Incoming</h4>
        {(snapshot.pending_trades || []).filter(t => t.to === myName).map((t) => (
                  <div key={t.id} className="card" style={{ padding: 8 }}>
                    <TradeHeader snapshot={snapshot} from={t.from} to={t.to} id={t.id} />
                    <TradeSummary t={t} tiles={tiles} />
                    {t.terms?.payments?.length ? (
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Recurring payments</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {t.terms.payments.map((p: any, i: number) => (
                            <li key={i}>{p.from} pays ${p.amount} to {p.to} for {p.turns} turns</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button className="btn" onClick={() => act('accept_trade', { trade_id: t.id })} disabled={t.to !== myName}>Accept</button>
                      <button className="btn" onClick={() => act('decline_trade', { trade_id: t.id })}>Decline</button>
                    </div>
                  </div>
                ))}
                {(snapshot.pending_trades || []).filter(t => t.to === myName).length === 0 && <div style={{ opacity: 0.7 }}>No incoming trades.</div>}
              </div>
              <div>
                <h4 style={{ margin: '6px 0' }}>My Offers</h4>
    {(snapshot.pending_trades || []).filter(t => t.from === myName).map((t) => (
                  <div key={t.id} className="card" style={{ padding: 8 }}>
          <TradeHeader snapshot={snapshot} from={t.from} to={t.to} id={t.id} />
                    <TradeSummary t={t} tiles={tiles} />
                    {t.terms?.payments?.length ? (
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Recurring payments</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {t.terms.payments.map((p: any, i: number) => (
                            <li key={i}>{p.from} pays ${p.amount} to {p.to} for {p.turns} turns</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button className="btn" onClick={() => act('cancel_trade', { trade_id: t.id })}>Cancel</button>
                    </div>
                  </div>
                ))}
                {(snapshot.pending_trades || []).filter(t => t.from === myName).length === 0 && <div style={{ opacity: 0.7 }}>No outgoing trades.</div>}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showLog ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowLog(false)}>
          <div style={{ background: '#fff', minWidth: 420, maxWidth: '85vw', borderRadius: 8, padding: 12 }} onClick={(e) => e.stopPropagation()}>
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
                        <button className="btn btn-link" style={{ padding: 0 }} onClick={() => { setOpenTradeId(String(e.id)); setShowTrades(true); setShowLog(false); }} title={`Open trade ${e.id}`}>{e.text || JSON.stringify(e)}</button>
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

      {/* Compact pending trades repositioned alongside players overview (below) */}
      <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div className="ui-title ui-h3">📬 Pending Trades</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {allTrades.length === 0 ? (
            <div className="ui-sm" style={{ opacity: 0.7 }}>No pending trades</div>
          ) : allTrades.map((t: any) => {
            const bg = t.to === myName ? 'rgba(46, 204, 113, 0.15)' : (t.from === myName ? 'rgba(52, 152, 219, 0.15)' : 'rgba(0,0,0,0.05)');
            const border = t.to === myName ? '1px solid rgba(39, 174, 96, 0.35)' : (t.from === myName ? '1px solid rgba(41, 128, 185, 0.35)' : '1px solid #e1e4e8');
            const brief = concise(t);
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 24, background: bg, border, borderRadius: 6, padding: '2px 6px' }}>
                <div style={{ fontSize: 11, whiteSpace: 'normal', wordBreak: 'break-word', flex: '1 1 auto' }} title={`#${t.id} ${t.from} → ${t.to} ${brief}`}>
                  <strong style={{ opacity: 0.95 }}>{t.from}</strong> → <strong style={{ opacity: 0.95 }}>{t.to}</strong> • {brief || '—'}
                </div>
                <button className="btn btn-ghost" style={{ width: 34, minWidth: 34, padding: 0 }} title="View details" onClick={() => setShowTrades(true)}>👁️</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Automation toggles */}
      <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="ui-title ui-h3">⚙️ Auto Actions</div>
          <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => setCollapseAuto(c => !c)}>{collapseAuto ? '➕' : '➖'}</button>
        </div>
        {!collapseAuto && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={autoRoll} onChange={(e) => setAutoRoll(e.target.checked)} /> Auto Roll</label>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={autoBuy} onChange={(e) => setAutoBuy(e.target.checked)} /> Auto Buy properties</label>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={autoEnd} onChange={(e) => setAutoEnd(e.target.checked)} /> Auto End Turn</label>
          <label style={{ fontSize: 12 }} title="Buys houses/hotels automatically when eligible"><input type="checkbox" checked={autoHouses} onChange={(e) => setAutoHouses(e.target.checked)} /> Auto Buy Houses/Hotels</label>
          <label style={{ fontSize: 12 }} title="Automatically mortgage properties when below $0"><input type="checkbox" checked={autoMortgage} onChange={(e) => setAutoMortgage(e.target.checked)} /> Auto Mortgage when negative</label>
        </div>}
        {!collapseAuto && <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>Keep at least $<input type="number" min={0} value={minKeep} onChange={(e) => setMinKeep(parseInt(e.target.value || '0', 10))} style={{ width: 90, marginLeft: 4 }} /></label>
          <label style={{ fontSize: 12 }}>Only buy cost <select value={costRule} onChange={(e) => setCostRule(e.target.value as any)} style={{ marginLeft: 4 }}>
            <option value="any">any</option>
            <option value="above">≥</option>
            <option value="below">≤</option>
          </select>
          $<input type="number" min={0} value={costValue} onChange={(e) => setCostValue(parseInt(e.target.value || '0', 10))} style={{ width: 100, marginLeft: 4 }} /></label>
          <label style={{ fontSize: 12 }} title="Evenly distribute houses across the color set when buying"><input type="checkbox" checked={autoSpread} onChange={(e) => setAutoSpread(e.target.checked)} /> Auto-Spread Houses</label>
        </div>}
      </div>

      {/* Recurring obligations summary */}
      <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="ui-title ui-h3">📆 Recurring Payments</div>
          <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => setCollapseRecurring(c => !c)}>{collapseRecurring ? '➕' : '➖'}</button>
        </div>
        {!collapseRecurring && <div className="ui-sm" style={{ display: 'grid', gap: 4 }}>
          {((snapshot as any).recurring || []).length === 0 ? (
            <div style={{ opacity: 0.7 }}>None</div>
          ) : ((snapshot as any).recurring || []).map((r: any, idx: number) => (
            <div key={idx}>
              {r.from} → {r.to}: ${r.amount} ({r.turns_left} turns left)
            </div>
          ))}
        </div>}
      </div>

      {/* Stocks (per-player) */}
      <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="ui-title ui-h3">📈 Stocks</div>
          <button className="btn btn-ghost" onClick={() => setShowStockCharts(true)}>Charts</button>
        </div>
        <StocksList lobbyId={lobbyId} snapshot={snapshot} myName={myName} onOpen={(row) => setOpenStock(row)} />
      </div>
      <StockModal open={!!openStock} lobbyId={lobbyId} snapshot={snapshot} stock={openStock} onClose={() => setOpenStock(null)} />
      <StockChartsModal open={showStockCharts} snapshot={snapshot} lobbyId={lobbyId} onOpenStock={(row) => { setShowStockCharts(false); setOpenStock(row); }} onClose={() => setShowStockCharts(false)} />
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
  const f = (snapshot.players || []).find(p => p.name === from);
  const t = (snapshot.players || []).find(p => p.name === to);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span title={from} style={{ width: 10, height: 10, borderRadius: '50%', background: f?.color || '#999', display: 'inline-block' }} />
        <span style={{ fontWeight: 600 }}>{from}</span>
        <span style={{ opacity: 0.7 }}>→</span>
        <span title={to} style={{ width: 10, height: 10, borderRadius: '50%', background: t?.color || '#999', display: 'inline-block' }} />
        <span style={{ fontWeight: 600 }}>{to}</span>
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
            <strong>{o.owner}</strong>
          </div>
          <div className="ui-sm" style={{ opacity: 0.9 }} title="Price is owner's current cash">
            {(() => {
              const ownerCash = (snapshot.players || []).find((p: any) => p.name === o.owner)?.cash ?? 0;
              const mine = (o.holdings || []).find((h: any) => h.investor === myName);
              const myPct = ((mine?.percent ?? 0) * 100).toFixed(2);
              return <>Price: ${ownerCash} • Mine: {myPct}%</>;
            })()}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={() => onOpen(o)}>Open</button>
          </div>
      {o.holdings && o.holdings.length > 0 ? (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, marginTop: 4 }}>
        Holders: {o.holdings.map((h: any) => `${h.investor}(${Number(h.shares || 0).toFixed(3)})`).join(', ')}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
