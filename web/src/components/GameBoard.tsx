import { useEffect, useMemo, useState } from 'react';
import { BACKEND_URL, BOARD_META_PATH } from '../config';
import { buildDefaultBoardTiles } from '../lib/boardFallback';
import TradePanel from './TradePanel';
import type { BoardTile, GameSnapshot, PropertyState, PropertyStateLike } from '../types';
import { buildPlayerColorMap } from '../lib/colors';
import { getSocket, getRemembered } from '../lib/socket';
import { getStreetRent, houseCostForGroup, mortgageValue, RAILROAD_RENTS } from '../lib/rentData';

type Props = { snapshot: GameSnapshot | null; lobbyId?: string };

export default function GameBoard({ snapshot, lobbyId }: Props) {
  const [tiles, setTiles] = useState<BoardTile[]>([]);
  const [err, setErr] = useState<string>('');
  const [openPropPos, setOpenPropPos] = useState<number | null>(null);
  const s = getSocket();
  const [highlightedPlayer, setHighlightedPlayer] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [chatLog, setChatLog] = useState<Array<{ from: string; message: string; ts?: number }>>([]);
  const [chatMsg, setChatMsg] = useState<string>('');
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [kickBanner, setKickBanner] = useState<{ target?: string | null; remaining?: number | null }>({});
  // Trade overlays and picker
  const [showTrade, setShowTrade] = useState(false);
  const [showTradeAdvanced, setShowTradeAdvanced] = useState(false);
  const [showPartnerPicker, setShowPartnerPicker] = useState<null | 'basic' | 'advanced'>(null);
  const [negativeBalanceError, setNegativeBalanceError] = useState<string | null>(null);
  const meName = (getRemembered().displayName || '').trim();
  // For unread badge on View Trades
  const unreadIncoming = useMemo(() => {
    const my = meName || (snapshot?.players?.[snapshot?.current_turn ?? -1]?.name || '');
    const incoming = (snapshot?.pending_trades || []).filter((t: any) => t.to === my);
    return incoming.length;
  }, [snapshot?.pending_trades, snapshot?.current_turn, snapshot?.players, meName]);
  useEffect(() => {
    const onHi = (ev: any) => setHighlightedPlayer(ev?.detail?.name || null);
    window.addEventListener('highlight-player' as any, onHi);
    return () => window.removeEventListener('highlight-player' as any, onHi);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setErr('');
      const bases = [BACKEND_URL || '', 'http://127.0.0.1:8000'];
      for (const base of bases) {
        try {
          const url = base ? `${base}${BOARD_META_PATH}` : BOARD_META_PATH;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) continue;
          const data = await res.json();
          const arr = Array.isArray(data) ? data : (Array.isArray(data?.tiles) ? data.tiles : null);
          if (arr && !cancelled) {
            setTiles(arr as BoardTile[]);
            return;
          }
        } catch (_) {
          // try next base
        }
      }
      if (!cancelled) {
        setErr('Board metadata unavailable (using fallback)');
        setTiles(buildDefaultBoardTiles());
      }
    }
    load();
    return () => { cancelled = true };
  }, []);

  // Subscribe to chat and lobby updates
  useEffect(() => {
    const onLobby = (l: any) => {
      if (!lobbyId || !l || l.id !== lobbyId) return;
      if (Array.isArray(l.chat)) {
        setChatLog(l.chat.map((c: any) => ({ from: c.from, message: c.message, ts: c.ts })));
      }
      setKickBanner({ target: l.kick_target, remaining: l.kick_remaining });
    };
    const onChat = (payload: any) => {
      if (!lobbyId || payload?.id !== lobbyId) return;
      const newMessage = { from: payload.from, message: payload.message, ts: payload.ts };
      setChatLog((prev) => [...prev, newMessage]);
      
      // Increment unread count if chat is closed and message is not from current user
      const myName = (getRemembered().displayName || '').trim();
      if (!chatOpen && payload.from !== myName) {
        setUnreadMessages(prev => prev + 1);
      }
    };
    s.on('lobby_state', onLobby);
    s.on('lobby_chat', onChat);
    return () => {
      s.off('lobby_state', onLobby);
      s.off('lobby_chat', onChat);
    };
  }, [s, lobbyId]);

  // Chat functions
  const handleChatToggle = () => {
    setChatOpen((prev) => {
      const newState = !prev;
      if (newState) {
        // Clear notifications when opening chat
        setUnreadMessages(0);
      }
      return newState;
    });
  };

  // Local countdown tick for kick banner
  useEffect(() => {
    if (!kickBanner.remaining) return;
    const t = setInterval(() => {
      setKickBanner((kb) => ({ ...kb, remaining: kb.remaining && kb.remaining > 0 ? kb.remaining - 1 : 0 }));
    }, 1000);
    return () => clearInterval(t);
  }, [kickBanner.remaining]);

  // tiles are rendered directly; map by position if needed later
  const tileByPos = useMemo(() => Object.fromEntries(tiles.map((t: BoardTile) => [t.pos, t])), [tiles]);

  const curIdx = snapshot?.current_turn ?? -1;
  const curName = curIdx >= 0 ? snapshot?.players?.[curIdx]?.name : undefined;
  const defaultHiOwner = highlightedPlayer || curName || null;
  const playerColors = buildPlayerColorMap(snapshot?.players ?? []);
  const normalize = (pos: number, raw: PropertyStateLike | undefined): PropertyState | undefined => {
    if (!raw) return undefined;
    const houses: number = typeof raw.houses === 'number' ? raw.houses : (raw.houseCount ?? 0);
    const hotel: boolean = typeof raw.hotel === 'boolean' ? raw.hotel : (houses === 5);
    const mortgaged: boolean = !!(raw.mortgaged ?? raw.is_mortgaged);
    const owner = (raw.owner ?? raw.owner_name ?? raw.ownerId ?? raw.owner_id) as string | undefined;
    const owner_color = (raw.owner_color ?? raw.ownerColour ?? raw.owner_colour ?? raw.ownerColor) as string | undefined
      || (owner ? playerColors[owner] : undefined);
    return { pos, owner, owner_color, houses: Math.min(houses, 4), hotel: !!hotel && houses >= 5 ? true : !!hotel, mortgaged };
  };
  const props = snapshot?.properties || {};

  const lastRoll = (() => {
    const la: any = snapshot?.last_action;
    if (la?.type === 'rolled') return { d1: la.d1 || 0, d2: la.d2 || 0 };
    return null;
  })();
  const act = (type: string, payload: any = {}) => s.emit('game_action', { id: lobbyId || (window as any).__lobbyId || '', action: { type, ...payload } });
  // No embedded panels here; board-only visuals
  

  return (
    <div className="board" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {err ? <div style={{ color: '#e74c3c', fontSize: 12, marginBottom: 6 }}>{err}</div> : null}
      <div style={{ padding: '4px 6px', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Turn: {curName || '—'}</div>
      <div className="board-wrap" style={{ position: 'relative' }}>
        {kickBanner?.target ? (
          <div style={{ position: 'absolute', left: '50%', top: -36, transform: 'translateX(-50%)', background: 'rgba(231, 76, 60, 0.9)', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12, zIndex: 5 }}>
            Vote-kick: {kickBanner.target} — {typeof kickBanner.remaining === 'number' ? `${Math.floor((kickBanner.remaining as number)/60)}:${String((kickBanner.remaining as number)%60).padStart(2,'0')}` : ''}
          </div>
        ) : null}
        <div className="grid">
        {tiles.length === 0 ? (
          <div style={{ gridColumn: 6, gridRow: 6, alignSelf: 'center', justifySelf: 'center', fontSize: 12, opacity: 0.8 }}>No board to display</div>
        ) : tiles.map((t: BoardTile) => {
          const p = normalize(t.pos, props[t.pos as any]);
          const ownerColor = p?.owner_color;
          const houses = p?.houses || 0;
          const hotel = p?.hotel || false;
          const mortgaged = !!p?.mortgaged;
          const isCurrent = snapshot?.players?.[curIdx]?.position === t.pos;
          const clickable = (t.type === 'property' || t.type === 'railroad' || t.type === 'utility' || t.type === 'jail');
          const edge = (() => {
            // Determine board edge to place owner marker toward center
            if (t.y === 10) return 'top'; // bottom row on grid -> owner above
            if (t.y === 0) return 'bottom'; // top row -> owner below
            if (t.x === 0) return 'right'; // left col -> owner to right
            if (t.x === 10) return 'left'; // right col -> owner to left
            return 'top';
          })();
          // Choose stripe orientation and side (inner edge toward board center)
          const stripeClass = (() => {
            if (t.y === 0) return 'h bottom';      // top row: stripe at bottom
            if (t.y === 10) return 'h top';        // bottom row: stripe at top
            if (t.x === 0) return 'v right';       // left col: stripe at right
            if (t.x === 10) return 'v left';       // right col: stripe at left
            return 'h bottom';
          })();
          return (
            <div key={t.pos} className={`tile type-${t.type || 'prop'}`} style={{ gridColumn: t.x + 1, gridRow: t.y + 1, outline: isCurrent ? '2px solid #f1c40f' : undefined, cursor: clickable ? 'pointer' : undefined }} onClick={() => clickable ? setOpenPropPos(t.pos) : undefined}>
              <div className={`stripe ${stripeClass}`} style={{ background: t.color || 'transparent' }} />
              <div className="name">{t.name}</div>
              {ownerColor ? <div className={`owner ${edge}`} style={{ background: ownerColor }} /> : null}
              {/* Buildings bar: 🏠 xN or 🏨 x1 */}
              {(houses > 0 || hotel) ? (
                <div className="buildings-bar">{hotel ? '🏨 x1' : `🏠 x${houses}`}</div>
              ) : null}
              {mortgaged ? <div className="mortgage-stamp">MORTGAGED</div> : null}
              {(() => {
                const here = (snapshot?.players || []).filter(pl => pl.position === t.pos);
                if (here.length === 0) return null;
                // Arrange up to 4 tokens in a centered 2x2 grid; 1 token stays centered
                const gridTemplate = here.length <= 1 ? '1fr' : '1fr 1fr';
                return (
                  <div className="tokens" style={{ display: 'grid', gridTemplateColumns: gridTemplate, gridTemplateRows: gridTemplate, alignItems: 'center', justifyItems: 'center', gap: 4 }}>
                    {here.map((pl, idx) => (
                      <span key={idx} className="token" title={pl.name} style={{ background: pl.color || '#111' }} />
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })}
        </div>
          {/* Dice overlay centered, moved down by 40px */}
          <div style={{ position: 'absolute', left: '50%', top: 'calc(50% + 40px)', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
              <span className="badge badge-muted" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{lastRoll ? lastRoll.d1 : '–'}</span>
              <span className="badge badge-muted" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{lastRoll ? lastRoll.d2 : '–'}</span>
            </div>
          </div>
          {/* Unified controls layer: contains trade controls and core action controls */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
            {/* Players Overview — centered, 250px above Trade row (trade is at 50%+50px => this at 50%-200px) */}
            <div style={{ position: 'absolute', left: '50%', top: 'calc(50% - 200px)', transform: 'translateX(-50%)', pointerEvents: 'auto' }}>
              <div className="ui-labelframe" style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid #e1e4e8', borderRadius: 8, padding: 10, minWidth: 320, maxWidth: '80vw' }}>
                <div className="ui-title ui-h3" style={{ textAlign: 'center' }}>Players Overview</div>
                <div style={{ fontSize: 12, marginTop: 6, display: 'grid', gap: 6 }}>
                  {(snapshot?.players || []).map((p, i) => (
                    <div key={i} className={`list-item${i === (snapshot?.current_turn ?? -1) ? ' current' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || 'var(--muted)', display: 'inline-block' }} />
                      <button className="btn btn-link" style={{ padding: 0 }} onClick={() => window.dispatchEvent(new CustomEvent('highlight-player', { detail: { name: p.name } }))} title="Highlight rents for this player's properties">{p.name}</button>
                      <span style={{ marginLeft: 'auto' }}>${p.cash}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                  <button className={`btn btn-ghost${unreadIncoming > 0 ? ' btn-with-badge' : ''}`} onClick={() => window.dispatchEvent(new CustomEvent('open-trades'))}>
                    📬 View Trades
                    {unreadIncoming > 0 ? <span className="btn-badge" title={`${unreadIncoming} new`}>{unreadIncoming}</span> : null}
                  </button>
                  <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent('open-log'))}>📜 Open Log</button>
                </div>
              </div>
            </div>
            {(() => {
              // Core roll/action buttons — now at former trade position and moved down by 30px
              const me = (snapshot?.players || [])[snapshot?.current_turn ?? -1];
              const myName = (getRemembered().displayName || '').trim() || me?.name || '';
              const myTurn = me?.name === myName;
              const rolledThisTurn = !!snapshot?.rolled_this_turn;
              const rollsLeft = snapshot?.rolls_left ?? 0;
              const canRollC = myTurn && (!rolledThisTurn || rollsLeft > 0);
              // compute canBuy similar to ActionPanel
              let canBuyC = false;
              {
                const la: any = snapshot?.last_action;
                if (['landed_on_unowned', 'offer_buy', 'can_buy'].includes(String(la?.type || ''))) {
                  canBuyC = true;
                } else {
                  const pos = me?.position ?? -1;
                  if (pos >= 0) {
                    const tilesArr: any[] = (snapshot as any)?.tiles || [];
                    const tile = tilesArr.find((x) => x?.pos === pos);
                    const propsMap: any = (snapshot as any)?.properties || {};
                    const st = propsMap?.[pos];
                    const buyable = tile && ['property', 'railroad', 'utility'].includes(String(tile.type)) && (tile.price || 0) > 0 && !(st && st.owner);
                    canBuyC = !!buyable && myTurn;
                  }
                }
              }
              const canEndC = myTurn && rolledThisTurn && rollsLeft === 0;
              return (
                <div style={{ position: 'absolute', left: '50%', top: 'calc(50% + 80px)', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
                  <button className="btn btn-primary" disabled={!canRollC} onClick={() => act('roll_dice')}>🎲 Roll</button>
                  <button className="btn btn-success" disabled={!canBuyC} onClick={() => act('buy_property')}>🏠 Buy</button>
                  <button className="btn btn-ghost" disabled={!canEndC} onClick={() => {
                    const socket = s;
                    socket.emit('game_action', { id: lobbyId, action: { type: 'end_turn' } }, (ack: any) => {
                      try { console.debug('[END_TURN][ACK]', ack); } catch {}
                      if (ack && ack.ok === false) {
                        const reasons: string[] = ack.reasons || [];
                        if (reasons.includes('negative_balance')) {
                          setNegativeBalanceError('You cannot end your turn with a negative balance. Please mortgage properties, sell houses, or get money from other players to bring your balance to $0 or higher.');
                        } else if (reasons.length) {
                          // For other reasons, use alert as fallback
                          alert('Cannot end turn: ' + reasons.join(', '));
                        }
                      }
                    });
                  }} title={(!canEndC ? 'Need roll or extra rolls left' : 'End your turn')}>⏭ End Turn</button>
                  <button 
                    className="btn btn-ghost" 
                    onClick={handleChatToggle} 
                    title="Toggle chat"
                    style={{
                      position: 'relative',
                      animation: unreadMessages > 1 ? 'jiggle 0.5s ease-in-out infinite alternate' : 'none'
                    }}
                  >
                    💬
                    {unreadMessages > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: '-2px',
                        right: '-2px',
                        background: '#ff4444',
                        color: 'white',
                        borderRadius: '50%',
                        width: '16px',
                        height: '16px',
                        fontSize: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        minWidth: '16px'
                      }}>
                        {unreadMessages > 9 ? '9+' : unreadMessages}
                      </span>
                    )}
                  </button>
                </div>
              );
            })()}
            {(() => {
              // Trade / Advanced / Bankruptcy row — moved up by 40px (from bottom: 85px to 125px)
              const cur = snapshot?.players?.[snapshot?.current_turn ?? -1];
              const myName = meName || cur?.name || '';
              const players = (snapshot?.players || []).map(p => p.name).filter(n => n !== myName);
              const enableTrade = players.length >= 1;
              return (
                <div style={{ position: 'absolute', left: '50%', bottom: '125px', transform: 'translateX(-50%)', display: 'flex', gap: 10, alignItems: 'stretch', pointerEvents: 'auto', background: 'rgba(255,255,255,0.9)', padding: '6px 10px', borderRadius: 10, boxShadow: '0 4px 14px rgba(0,0,0,0.15)', border: '1px solid #d0d7de' }}>
                  <button className="btn btn-trade" style={{ minWidth: 110 }} disabled={!enableTrade} onClick={() => setShowPartnerPicker('basic')} title="Create a standard property/cash trade">🤝 Trade</button>
                  <button className="btn btn-advanced" style={{ minWidth: 140 }} disabled={!enableTrade} onClick={() => setShowPartnerPicker('advanced')} title="Open advanced combined trade (recurring terms)">⚡ Advanced</button>
                  <div style={{ width: 1, background: 'rgba(0,0,0,0.15)', margin: '0 2px' }} />
                  <button className="btn btn-danger" style={{ minWidth: 120 }} onClick={() => act('bankrupt')} title="Declare bankruptcy">💥 Bankruptcy</button>
                </div>
              );
            })()}
          </div>
  </div>
  {/* Partner pre-menu overlay */}
  {showPartnerPicker ? (() => {
    const cur = snapshot?.players?.[snapshot?.current_turn ?? -1];
    const myName = meName || cur?.name || '';
    const others = (snapshot?.players || []).map(p => p.name).filter(n => n !== myName);
    const pick = (partner: string) => {
      setShowPartnerPicker(null);
      if (showPartnerPicker === 'basic') setShowTrade(true);
      if (showPartnerPicker === 'advanced') setShowTradeAdvanced(true);
      // Stash initial partner globally for TradePanel
      try { (window as any).__initialPartner = partner; } catch {}
    };
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowPartnerPicker(null)}>
        <div style={{ background: '#fff', borderRadius: 8, padding: 12, minWidth: 320 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{showPartnerPicker === 'advanced' ? 'Choose partner for Advanced Trade' : 'Choose partner for Trade'}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {others.length === 0 ? <div style={{ opacity: 0.7 }}>No other players.</div> : others.map((n, i) => (
              <button key={i} className="btn" onClick={() => pick(n)}>{n}</button>
            ))}
          </div>
        </div>
      </div>
    );
  })() : null}

  {/* Trade panels rendered from board */}
  {showTrade ? (
    <TradePanel
      lobbyId={lobbyId!}
      snapshot={snapshot!}
      variant="properties"
      initialPartner={(window as any).__initialPartner || ''}
      onClose={() => setShowTrade(false)}
    />
  ) : null}
  {showTradeAdvanced ? (
    <TradePanel
      lobbyId={lobbyId!}
      snapshot={snapshot!}
      variant="advanced"
      initialPartner={(window as any).__initialPartner || ''}
      onClose={() => setShowTradeAdvanced(false)}
    />
  ) : null}
  
      {/* Modern chat panel - positioned on the right side */}
      {chatOpen && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          right: 0, 
          width: 'min(400px, 40vw)', 
          height: '100vh', 
          background: '#fff', 
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', 
          display: 'flex', 
          flexDirection: 'column',
          zIndex: 2000,
          borderLeft: '1px solid #e0e0e0'
        }}>
          {/* Header */}
          <div style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white', 
            padding: '16px 20px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between'
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>💬 Game Chat</h3>
            <button 
              onClick={handleChatToggle} 
              style={{ 
                background: 'rgba(255,255,255,0.2)', 
                border: 'none', 
                color: 'white', 
                borderRadius: 6, 
                padding: '6px 8px', 
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              ✕
            </button>
          </div>
            
            {/* Messages area */}
            <div style={{ 
              flex: 1, 
              padding: '16px 20px', 
              overflowY: 'auto', 
              background: '#f8f9fa',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              {chatLog.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  color: '#666', 
                  fontStyle: 'italic', 
                  marginTop: 40 
                }}>
                  No messages yet. Start the conversation!
                </div>
              ) : chatLog.map((c, i) => {
                const myName = (getRemembered().displayName || '').trim();
                const isMe = c.from === myName;
                return (
                  <div key={i} style={{ 
                    display: 'flex', 
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: 4
                  }}>
                    <div style={{
                      maxWidth: '75%',
                      padding: '8px 12px',
                      borderRadius: '16px',
                      background: isMe ? '#007bff' : '#e9ecef',
                      color: isMe ? 'white' : '#333',
                      fontSize: 14,
                      wordBreak: 'break-word'
                    }}>
                      {!isMe && (
                        <div style={{ 
                          fontSize: 11, 
                          opacity: 0.8, 
                          marginBottom: 2,
                          fontWeight: 600
                        }}>
                          {c.from}
                        </div>
                      )}
                      <div>{c.message}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Input area */}
            <div style={{ 
              padding: '16px 20px', 
              borderTop: '1px solid #e9ecef',
              background: 'white'
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                  placeholder="Type a message…" 
                  value={chatMsg} 
                  onChange={(e) => setChatMsg(e.target.value)} 
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter') { 
                      if (chatMsg.trim()) { 
                        s.emit('chat_send', { id: lobbyId, message: chatMsg.trim() }); 
                        setChatMsg(''); 
                      } 
                    } 
                  }} 
                  style={{ 
                    flex: 1, 
                    padding: '10px 12px', 
                    border: '1px solid #ddd', 
                    borderRadius: 20, 
                    fontSize: 14,
                    outline: 'none'
                  }} 
                />
                <button 
                  onClick={() => { 
                    if (chatMsg.trim()) { 
                      s.emit('chat_send', { id: lobbyId, message: chatMsg.trim() }); 
                      setChatMsg(''); 
                    } 
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 20,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  Send
                </button>
              </div>
            </div>
        </div>
      )}
      {openPropPos != null ? (() => {
        const t = tileByPos[openPropPos!];
  const p = normalize(openPropPos!, props[openPropPos as any]);
        const owner = p?.owner;
  const price = (t as any)?.price ?? 0;
  // Buy button moved to central action bar; evaluate there
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setOpenPropPos(null)}>
            <div style={{ background: '#fff', minWidth: 320, maxWidth: '85vw', borderRadius: 8, padding: 12 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{t?.name || `Tile ${openPropPos}`}</h3>
                <button className="btn btn-ghost" onClick={() => setOpenPropPos(null)}>❌ Close</button>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <div style={{ width: 18, height: 18, background: t?.color || 'transparent', border: '1px solid #bbb' }} />
                <div style={{ fontSize: 12, opacity: 0.8 }}>{t?.type}</div>
              </div>
              {price ? <div style={{ marginTop: 8, fontSize: 12 }}>Price: ${price} {t?.group ? <span style={{ opacity: 0.75 }}>(mortgage ${mortgageValue(price)})</span> : null}</div> : null}
              {owner ? <div style={{ marginTop: 4, fontSize: 12 }}>Owner: {owner}</div> : null}
              {(() => {
                if (!t) return null;
                if (t.type === 'property') {
                  const r = getStreetRent(t.name);
                  const hc = houseCostForGroup(t.group);
                  // Determine which rent bracket is currently active for this property
                  const owner = p?.owner;
                  const houses = Math.max(0, Number(p?.houses || 0));
                  const hasHotel = !!p?.hotel;
                  const group = t.group;
                  const isSet = (() => {
                    if (!owner || !group) return false;
                    // All properties in group owned by same owner and not mortgaged
                    const groupPositions = Object.values(tileByPos)
                      .filter(tt => tt.type === 'property' && tt.group === group)
                      .map(tt => tt.pos);
                    return groupPositions.length > 0 && groupPositions.every(pos => {
                      const st: any = (props as any)?.[pos] || {};
                      return st.owner === owner && !st.mortgaged;
                    });
                  })();
                  const currentKey: 'base' | 'withSet' | 'house1' | 'house2' | 'house3' | 'house4' | 'hotel' | null = (() => {
                    if (!owner) return null;
                    if (hasHotel) return 'hotel';
                    if (houses > 0) return (`house${Math.min(4, houses)}` as any);
                    return isSet ? 'withSet' : 'base';
                  })();
                  return r ? (
                    <div className="ui-card" style={{ marginTop: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Rent Details</div>
                      {(() => {
                        const ownerIsHi = !!(owner && defaultHiOwner && owner === defaultHiOwner);
                        const cls = (k: string) => (ownerIsHi && currentKey && k === currentKey) ? 'rent-highlight' : '';
                        return (
                          <>
                            <div className={cls(isSet ? 'withSet' : 'base')}>Base: ${isSet ? r.withSet : r.base} {t.group ? <span style={{ opacity: 0.7 }}>(double with full set: ${r.withSet})</span> : null}</div>
                            <div className={cls('house1')}>With 1 House: ${r.house1}</div>
                            <div className={cls('house2')}>With 2 Houses: ${r.house2}</div>
                            <div className={cls('house3')}>With 3 Houses: ${r.house3}</div>
                            <div className={cls('house4')}>With 4 Houses: ${r.house4}</div>
                            <div className={cls('hotel')}>With Hotel: ${r.hotel}</div>
                          </>
                        );
                      })()}
                      <div style={{ marginTop: 6 }}>House cost: ${hc} each, Hotel: ${hc} + return 4 houses</div>
                    </div>
                  ) : null;
                } else if (t.type === 'railroad') {
                  return (
                    <div className="ui-card" style={{ marginTop: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Railroad Rent</div>
                      <div>1 RR: ${RAILROAD_RENTS[0]}</div>
                      <div>2 RR: ${RAILROAD_RENTS[1]}</div>
                      <div>3 RR: ${RAILROAD_RENTS[2]}</div>
                      <div>4 RR: ${RAILROAD_RENTS[3]}</div>
                    </div>
                  );
                } else if (t.type === 'utility') {
                  return (
                    <div className="ui-card" style={{ marginTop: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Utility Rent</div>
                      <div>One utility: 4× dice roll</div>
                      <div>Both utilities: 10× dice roll</div>
                    </div>
                  );
                } else if (t.type === 'jail') {
                  // Jail tile: allow using jail card only when it's my turn, I'm in jail, haven't rolled, and have a card
                  const me = (snapshot?.players || [])[snapshot?.current_turn ?? -1];
                  const myName = (getRemembered().displayName || '').trim() || me?.name || '';
                  const myTurn = me?.name === myName;
                  const rolledThisTurn = !!snapshot?.rolled_this_turn;
                  const canUseJailCard = !!(myTurn && me?.in_jail && !rolledThisTurn && (me?.jail_cards || 0) > 0);
                  return (
                    <div className="ui-card" style={{ marginTop: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Jail</div>
                      <div>You're just visiting, or serving time if in jail.</div>
                      <div style={{ marginTop: 8 }}>
                        <button className="btn btn-warning" disabled={!canUseJailCard} onClick={() => act('use_jail_card')}>🪪 Use Jail Card</button>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              {(() => {
                const la: any = snapshot?.last_action;
                if (la && typeof la.pos === 'number' && la.pos === openPropPos && /denied|failed/.test(String(la.type || ''))) {
                  const reason = la.reason || la.type;
                  return <div style={{ marginTop: 6, fontSize: 12, color: '#c0392b' }}>Action denied: {reason}</div>;
                }
                return null;
              })()}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {(() => {
                  const meIdx = snapshot?.current_turn ?? -1;
                  const me = meIdx >= 0 ? snapshot?.players?.[meIdx] : undefined;
                  const iOwn = !!(me?.name && p?.owner === me.name);
                  const buyable = t && (t.type === 'property' || t.type === 'railroad' || t.type === 'utility');
                  const isProp = t?.type === 'property';
                  const pos = t?.pos ?? 0;
                  const doEmit = (type: string) => () => s.emit('game_action', { id: lobbyId || (window as any).__lobbyId || '', action: { type, pos } });
                  return (
                    <>
                      <button className="btn btn-ghost" onClick={doEmit('mortgage')} disabled={!iOwn || !buyable || !!p?.mortgaged}>🏦 Mortgage</button>
                      <button className="btn btn-ghost" onClick={doEmit('unmortgage')} disabled={!iOwn || !buyable || !p?.mortgaged}>💳 Unmortgage</button>
                      <button className="btn btn-ghost" onClick={doEmit('buy_house')} disabled={!iOwn || !isProp}>🏠 Buy House</button>
                      <button className="btn btn-ghost" onClick={doEmit('sell_house')} disabled={!iOwn || !isProp}>🏚️ Sell House</button>
                      <button className="btn btn-ghost" onClick={doEmit('buy_hotel')} disabled={!iOwn || !isProp}>🏨 Buy Hotel</button>
                      <button className="btn btn-ghost" onClick={doEmit('sell_hotel')} disabled={!iOwn || !isProp}>🏨 Sell Hotel</button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })() : null}

      {/* Negative Balance Error Modal */}
      {negativeBalanceError ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2500 }} onClick={() => setNegativeBalanceError(null)}>
          <div style={{ 
            background: 'white', 
            padding: '24px', 
            borderRadius: '8px', 
            maxWidth: '500px', 
            margin: '20px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            border: '2px solid #e74c3c'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '24px', marginRight: '12px' }}>⚠️</span>
              <h3 style={{ margin: 0, color: '#e74c3c' }}>Cannot End Turn</h3>
            </div>
            <p style={{ margin: '0 0 20px 0', lineHeight: '1.5' }}>
              {negativeBalanceError}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-primary" onClick={() => setNegativeBalanceError(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
