import { useEffect, useMemo, useRef, useState } from 'react';
import { getSocket, getRemembered } from '../lib/socket';
import TradePanel from './TradePanel';
import type { GameSnapshot } from '../types';
import { buildDefaultBoardTiles } from '../lib/boardFallback';
import type { BoardTile } from '../types';

type Props = { lobbyId: string; snapshot: GameSnapshot };

export default function ActionPanel({ lobbyId, snapshot }: Props) {
  const s = getSocket();
  const me = snapshot.players?.[snapshot.current_turn];
  const myName = (getRemembered().displayName || '').trim() || (me?.name || '');
  const myPlayer = (snapshot.players || []).find(p => p.name === myName);
  const [showTrade, setShowTrade] = useState(false);
  const [showTradeAdvanced, setShowTradeAdvanced] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  const [tiles, setTiles] = useState<Record<number, BoardTile>>({});
  const [seenTradeIds, setSeenTradeIds] = useState<Set<number>>(new Set());
  const [jiggleFlag, setJiggleFlag] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

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
  const rollsLeft = snapshot.rolls_left ?? 0;
  const canRoll = myTurn && (!rolledThisTurn || rollsLeft > 0);
  const canEndTurn = myTurn && rolledThisTurn && rollsLeft === 0;
  const canBuy = useMemo(() => {
    if (!myTurn) return false;
    const la: any = snapshot.last_action;
    if (['landed_on_unowned', 'offer_buy', 'can_buy'].includes(String(la?.type || ''))) return true;
    // fallback heuristic: if on a buyable tile with a price and no owner
    const pos = myPlayer?.position ?? -1;
    if (pos < 0) return false;
    const t = tiles[pos];
    if (!t) return false;
    if (!['property', 'railroad', 'utility'].includes(String(t.type))) return false;
    if (!t.price || t.price <= 0) return false;
    const prop: any = (snapshot.properties as any)?.[pos];
    return !prop || !prop.owner;
  }, [myTurn, snapshot.last_action, myPlayer?.position, tiles, snapshot.properties]);

  const lastDice = useMemo(() => {
    const la: any = snapshot.last_action;
    if (la?.type === 'rolled') return `${la.d1 ?? ''} + ${la.d2 ?? ''}${la.doubles ? ' (doubles)' : ''}`;
    return '';
  }, [snapshot.last_action]);

  // Track incoming trades to show badge and jiggle on new ones
  const incomingTrades = useMemo(() => (snapshot.pending_trades || []).filter(t => t.to === myName), [snapshot.pending_trades, myName]);
  const unreadCount = useMemo(() => incomingTrades.filter(t => !seenTradeIds.has(t.id)).length, [incomingTrades, seenTradeIds]);
  useEffect(() => {
    // If new trade IDs appear that weren't seen, trigger a short jiggle
    const ids = new Set(incomingTrades.map(t => t.id));
    let hasNew = false;
    for (const id of ids) if (!seenTradeIds.has(id)) { hasNew = true; break; }
    if (hasNew) {
      setJiggleFlag(true);
      const to = setTimeout(() => setJiggleFlag(false), 700);
      return () => clearTimeout(to);
    }
  }, [incomingTrades]);

  // When opening the trades modal, mark current incoming as seen
  useEffect(() => {
    if (showTrades) {
      setSeenTradeIds(prev => {
        const next = new Set(prev);
        for (const t of incomingTrades) next.add(t.id);
        return next;
      });
    }
  }, [showTrades, incomingTrades]);

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

  return (
    <div className="actions actions-panel">
      <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div className="ui-title ui-h3">Current Turn</div>
        <div className="ui-h3" style={{ marginTop: 6 }}>Turn: {snapshot.players?.[snapshot.current_turn || 0]?.name ?? '\u2014'}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn btn-primary" disabled={!canRoll} title={!myTurn ? 'Not your turn' : (rolledThisTurn && rollsLeft === 0 ? 'No rolls left' : undefined)} onClick={() => act('roll_dice')}>🎲 Roll {lastDice ? <span style={{ marginLeft: 6, opacity: 0.8 }}>last: {lastDice}</span> : null}</button>
          <button className="btn btn-success" disabled={!canBuy} onClick={() => act('buy_property')} title={canBuy && currentTile ? `${currentTile.name} — $${currentTile.price ?? 0}` : undefined}>🏠 Buy</button>
          {myPlayer?.in_jail && (myPlayer?.jail_cards || 0) > 0 ? (
            <button className="btn btn-warning" onClick={() => act('use_jail_card')}>🪪 Use Jail Card</button>
          ) : null}
          <button className="btn btn-ghost" disabled={!canEndTurn} onClick={() => act('end_turn')}>⏭ End Turn</button>
          <button className="btn btn-primary" onClick={() => setShowTrade(true)} disabled={(snapshot?.players?.length || 0) < 2}>🤝 Trade</button>
          <button className="btn btn-warning" onClick={() => setShowTradeAdvanced(true)} disabled={(snapshot?.players?.length || 0) < 2} title="Coming later">⚡ Advanced Trade</button>
          <button className="btn btn-danger" onClick={() => act('bankrupt')}>💥 Bankruptcy</button>
        </div>
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

      <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div className="ui-title ui-h3">Dice</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          {(() => {
            const la: any = snapshot?.last_action;
            if (la?.type === 'rolled') {
              const d1 = la.d1 || 0, d2 = la.d2 || 0;
              return (
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="badge badge-muted" style={{ width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{d1}</span>
                  <span className="badge badge-muted" style={{ width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{d2}</span>
                </div>
              );
            }
            return <span className="ui-sm" style={{ opacity: 0.7 }}>—</span>;
          })()}
        </div>
      </div>

      <div className="ui-labelframe" style={{ marginBottom: 8 }}>
        <div className="ui-title ui-h3">Players Overview</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          {snapshot.players?.map((p, i) => (
            <div key={i} className={`list-item${i === snapshot.current_turn ? ' current' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color || 'var(--muted)', display: 'inline-block' }} />
              <span>{p.name}:</span>
              <span style={{ marginLeft: 'auto' }}>${p.cash}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className={`btn btn-ghost btn-with-badge ${jiggleFlag ? 'jiggle' : ''}`} onClick={() => setShowTrades(true)}>
            📬 View Trades
            {unreadCount > 0 ? <span className="btn-badge" title={`${unreadCount} new`}>{unreadCount}</span> : null}
          </button>
          <button className="btn btn-ghost" onClick={() => setShowLog(true)}>📜 Open Log</button>
        </div>
      </div>

      {showTrade ? <TradePanel lobbyId={lobbyId} snapshot={snapshot} variant="properties" onClose={() => setShowTrade(false)} /> : null}
      {showTradeAdvanced ? <TradePanel lobbyId={lobbyId} snapshot={snapshot} variant="advanced" onClose={() => setShowTradeAdvanced(false)} /> : null}

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
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>From: {t.from}</span>
                      <span style={{ opacity: 0.7 }}>#{t.id}</span>
                    </div>
                    <TradeSummary t={t} tiles={tiles} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button className="btn" onClick={() => act('accept_trade', { trade_id: t.id })}>Accept</button>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>To: {t.to}</span>
                      <span style={{ opacity: 0.7 }}>#{t.id}</span>
                    </div>
                    <TradeSummary t={t} tiles={tiles} />
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
            <div ref={logRef} style={{ fontSize: 12, marginTop: 8, maxHeight: '60vh', overflow: 'auto' }}>
              {snapshot.log && snapshot.log.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {snapshot.log.map((e: any, i: number) => (
                    <li key={i} style={{ padding: '4px 0', borderBottom: '1px dashed #eee' }}>
                      <span style={{ marginRight: 6 }}>
                        {e.type === 'rolled' ? '🎲' : e.type === 'buy' ? '🏠' : e.type === 'end_turn' ? '⏭' : e.type === 'bankrupt' ? '💥' : '•'}
                      </span>
                      <span>{e.text || JSON.stringify(e)}</span>
                    </li>
                  ))}
                </ul>
              ) : <div>No log entries yet.</div>}
            </div>
          </div>
        </div>
      ) : null}
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
