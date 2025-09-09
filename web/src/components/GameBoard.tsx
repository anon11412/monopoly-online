import { useEffect, useMemo, useState, useRef } from 'react';
import { buildDefaultBoardTiles } from '../lib/boardFallback';
import TradePanel from './TradePanel';
import type { BoardTile, GameSnapshot, PropertyState, PropertyStateLike } from '../types';
import { buildPlayerColorMap } from '../lib/colors';
import { getSocket, getRemembered } from '../lib/socket';
import { getStreetRent, houseCostForGroup, mortgageValue, RAILROAD_RENTS } from '../lib/rentData';
import { playGameSound } from '../lib/audio';

type Props = { snapshot: GameSnapshot; lobbyId: string };

// Helper function to calculate optimal font size for single-line (or merged) property name text
const calculateOptimalFontSize = (text: string, maxWidth: number, maxHeight: number, isCorner: boolean = false): number => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 11;
  const baseFont = isCorner ? 14 : 11;
  const minFont = 7;
  const maxFont = isCorner ? 16 : 13;
  for (let fontSize = Math.min(baseFont, maxFont); fontSize >= minFont; fontSize -= 0.5) {
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.1;
    if (textWidth <= maxWidth - 6 && textHeight <= maxHeight - 4) return fontSize;
  }
  return minFont;
};

export default function GameBoard({ snapshot, lobbyId }: Props) {
  const s = getSocket();
  // Core board / property state
  const [tiles, setTiles] = useState<BoardTile[]>([]);
  const [openPropPos, setOpenPropPos] = useState<number | null>(null);
  const [highlightedPlayer, setHighlightedPlayer] = useState<string | null>(null);
  const [showTrade, setShowTrade] = useState(false);
  const [showTradeAdvanced, setShowTradeAdvanced] = useState(false);
  const [showPartnerPicker, setShowPartnerPicker] = useState<null | 'basic' | 'advanced'>(null);
  const [negativeBalanceError, setNegativeBalanceError] = useState<string | null>(null);
  const [moneyAnimations, setMoneyAnimations] = useState<Record<string, string>>({});
  const [turnChangeAnimation, setTurnChangeAnimation] = useState(false);
  const [unreadIncoming, setUnreadIncoming] = useState(0);
  const [propertyAnimations, setPropertyAnimations] = useState<Record<number, string>>({});
  const [diceAnimation, setDiceAnimation] = useState('');
  // (err placeholder removed) 
  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLog, setChatLog] = useState<Array<{ from: string; message: string; ts?: number }>>([]);
  const [chatMsg, setChatMsg] = useState('');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  // Vote kick banner
  const [kickBanner, setKickBanner] = useState<{ target?: string | null; votes?: number; required?: number; remaining?: number }>({});
  // Helpers to remember previous sets for unread counts
  const prevIncomingRef = useRef<Set<string>>(new Set());
  const prevTradeIdsRef = useRef<Set<string>>(new Set());
  const prevLastActionRef = useRef<string | null>(null);
  const meName = (getRemembered().displayName || '').trim();

  // Load tiles from snapshot or fallback
  useEffect(() => {
    const snapTiles: any[] | undefined = (snapshot as any)?.tiles;
    if (Array.isArray(snapTiles) && snapTiles.length > 0) {
      setTiles(snapTiles as BoardTile[]);
    } else if (tiles.length === 0) {
      setTiles(buildDefaultBoardTiles());
    }
  }, [(snapshot as any)?.tiles]);

  // Highlight player event (used for rent highlight logic)
  useEffect(() => {
    const onHi = (e: any) => setHighlightedPlayer(e.detail?.name || null);
    window.addEventListener('highlight-player' as any, onHi);
    return () => window.removeEventListener('highlight-player' as any, onHi);
  }, []);

  // Track unread incoming trades (basic heuristic)
  useEffect(() => {
    const mine = new Set((snapshot?.pending_trades || []).filter((t: any) => t.to === meName).map((t: any) => String(t.id)));
    let newly = 0;
    mine.forEach(id => { if (!prevIncomingRef.current.has(id)) newly++; });
    if (newly > 0) setUnreadIncoming(u => u + newly);
    prevIncomingRef.current = mine;
  }, [snapshot?.pending_trades, meName]);

  // Global trade sound triggers (new pending, accepted, declined)
  useEffect(() => {
    const trades = (snapshot?.pending_trades || []) as any[];
    const currentIds = new Set(trades.map(t => String(t.id)));
    // Detect new trades
    for (const t of trades) {
      const id = String(t.id);
      if (!prevTradeIdsRef.current.has(id)) {
        playGameSound('trade_created');
      }
    }
    prevTradeIdsRef.current = currentIds;
    // Detect accepted/declined via last_action
    const la: any = snapshot?.last_action;
    const laType = la?.type || '';
    if (laType && laType !== prevLastActionRef.current) {
      if (laType === 'trade_accepted') playGameSound('trade_accepted');
      if (laType === 'trade_declined') playGameSound('trade_denied');
    }
    prevLastActionRef.current = laType;
  }, [snapshot?.pending_trades, snapshot?.last_action]);

  // Chat socket listener
  useEffect(() => {
    // Track seen messages to avoid duplicates when listening to multiple events
    const seenRef: { current: Set<string> } = (window as any).__chatSeenRef || { current: new Set() };
    (window as any).__chatSeenRef = seenRef;
  const register = (msg: any) => {
      if (!msg) return;
      const ts = msg.ts || Date.now();
      const from = msg.from || '???';
      const text = msg.message || '';
      const key = `${ts}-${from}-${text}`;
      if (seenRef.current.has(key)) return; // duplicate (likely from second event)
      seenRef.current.add(key);
      if (seenRef.current.size > 600) { // trim occasionally
        const arr = Array.from(seenRef.current).slice(-400);
        seenRef.current.clear();
        arr.forEach(k => seenRef.current.add(k));
      }
      setChatLog(prev => [...prev, { from, message: text, ts }]);
      if (!chatOpen) setUnreadMessages(u => u + 1);
    };
  const onChat = (msg: any) => register(msg);
  const onLobbyChat = (msg: any) => {
      // Filter to matching lobby
      const lid = msg?.id || msg?.lobby_id;
      if (lid && lid !== lobbyId) return;
  register(msg);
    };
    s.on('chat_message', onChat);
    s.on('lobby_chat', onLobbyChat);
    return () => { s.off('chat_message', onChat); s.off('lobby_chat', onLobbyChat); };
  }, [s, chatOpen, lobbyId]);

  // Vote kick status
  useEffect(() => {
    const onLobbyState = (l: any) => {
      setKickBanner({ target: l.kick_target, votes: l.kick_votes, required: l.kick_required, remaining: l.kick_remaining });
    };
    s.on('lobby_state', onLobbyState);
    return () => { s.off('lobby_state', onLobbyState); };
  }, [s]);

  // Chat toggle
  const handleChatToggle = () => {
    setChatOpen(prev => {
      const next = !prev;
      if (next) setUnreadMessages(0);
      return next;
    });
  };

  // Auto-scroll chat
  useEffect(() => {
    if (chatOpen && chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatLog, chatOpen]);

  // Local countdown for kick banner
  useEffect(() => {
    if (!kickBanner.remaining) return;
    const t = setInterval(() => {
      setKickBanner(kb => ({ ...kb, remaining: kb.remaining && kb.remaining > 0 ? kb.remaining - 1 : 0 }));
    }, 1000);
    return () => clearInterval(t);
  }, [kickBanner.remaining]);

  // Money change animations + audio
  const prevMoney = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!snapshot?.players) return;
    const myName = (getRemembered().displayName || '').trim();
    for (const p of snapshot.players) {
      const curCash = p.cash || 0;
      const prevCash = prevMoney.current[p.name] || 0;
      if (prevCash > 0 && curCash !== prevCash) {
        const amount = curCash - prevCash;
        if (p.name === myName) {
          playGameSound('money_changed', { currentPlayer: p.name, myName, amount });
        }
        const cls = curCash > prevCash ? 'animate-money-gain' : 'animate-money-loss';
        setMoneyAnimations(prev => ({ ...prev, [p.name]: cls }));
        setTimeout(() => {
          setMoneyAnimations(prev => { const cp = { ...prev }; delete cp[p.name]; return cp; });
        }, 600);
      }
      prevMoney.current[p.name] = curCash;
    }
  }, [snapshot?.players]);

  // Turn change animation
  const prevTurn = useRef<number>(-1);
  useEffect(() => {
    if (snapshot?.current_turn !== undefined && snapshot.current_turn !== prevTurn.current && prevTurn.current >= 0) {
      setTurnChangeAnimation(true);
      setTimeout(() => setTurnChangeAnimation(false), 1500);
    }
    prevTurn.current = snapshot?.current_turn ?? -1;
  }, [snapshot?.current_turn]);

  // Derived helpers
  const tileByPos = useMemo(() => Object.fromEntries(tiles.map(t => [t.pos, t])), [tiles]);

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
  {/* error banner removed (no err state) */}
      <div style={{ padding: '4px 6px', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Turn: {curName || '—'}</div>
      <div className="board-wrap" style={{ position: 'relative' }}>
        {kickBanner?.target ? (
          <div style={{ 
            position: 'absolute', 
            left: '50%', 
            top: -48, 
            transform: 'translateX(-50%)', 
            background: 'linear-gradient(135deg, rgba(231, 76, 60, 0.95), rgba(192, 57, 43, 0.95))', 
            color: '#fff', 
            padding: '8px 16px', 
            borderRadius: '12px', 
            fontSize: '13px', 
            fontWeight: '600',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(231, 76, 60, 0.4)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            minWidth: '220px',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span>🚫</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700' }}>VOTE KICK ACTIVE</div>
                <div style={{ fontSize: '12px', opacity: 0.9, marginTop: 2 }}>
                  Target: <strong>{kickBanner.target}</strong>
                </div>
                <div style={{ fontSize: '12px', opacity: 0.9, marginTop: 2 }}>
                  Votes: <strong>{kickBanner.votes || 0}/{kickBanner.required || 1}</strong>
                  {(kickBanner.votes || 0) >= (kickBanner.required || 1) ? ' ✓' : ''}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8, marginTop: 2 }}>
                  {typeof kickBanner.remaining === 'number' ? (
                    <>Time: <strong>{Math.floor((kickBanner.remaining as number)/60)}:{String((kickBanner.remaining as number)%60).padStart(2,'0')}</strong></>
                  ) : (
                    'Pending...'
                  )}
                </div>
              </div>
              <span>⏰</span>
            </div>
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
          
          return (
            <div 
              key={t.pos} 
              className={`tile type-${t.type || 'prop'} board-tile ${propertyAnimations[t.pos] || ''}`} 
              data-corner={(t.x === 0 && t.y === 0) || (t.x === 10 && t.y === 0) || (t.x === 0 && t.y === 10) || (t.x === 10 && t.y === 10)}
              style={{ gridColumn: t.x + 1, gridRow: t.y + 1, outline: isCurrent ? '2px solid #f1c40f' : undefined, cursor: clickable ? 'pointer' : undefined }} 
              onClick={() => clickable ? setOpenPropPos(t.pos) : undefined}
            >
              {/* Flag background overlay for properties - restricted to card area */}
              {t.type === 'property' && t.flag ? (
                <div className="flag-overlay" style={{
                  position: 'absolute',
                  top: '2px',
                  left: '2px',
                  right: '2px',
                  bottom: '2px',
                  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50" x="50" text-anchor="middle" font-size="50">${t.flag}</text></svg>`)}")`,
                  backgroundSize: '80% 80%',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  opacity: 0.15,
                  borderRadius: '4px',
                  filter: 'blur(1px)',
                  zIndex: 1
                }} />
              ) : null}
              
              {/* Flag circle for properties - positioned on inner edge */}
              {t.type === 'property' && t.flag ? (
                <div className="flag-circle" style={{
                  position: 'absolute',
                  width: '32px', // ~50% width of property card (~64px)
                  height: '32px',
                  borderRadius: '50%',
                  background: 'white',
                  border: '2px solid #333',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px', // Increased for larger flag circle
                  zIndex: 5,
                  ...((() => {
                    // Position flag circle on inner edge closest to center
                    if (t.y === 0) return { bottom: '-16px', left: '50%', transform: 'translateX(-50%)' }; // top row
                    if (t.y === 10) return { top: '-16px', left: '50%', transform: 'translateX(-50%)' }; // bottom row
                    if (t.x === 0) return { right: '-16px', top: '50%', transform: 'translateY(-50%)' }; // left col
                    if (t.x === 10) return { left: '-16px', top: '50%', transform: 'translateY(-50%)' }; // right col
                    return { bottom: '-16px', left: '50%', transform: 'translateX(-50%)' };
                  })())
                }}>
                  {t.flag}
                </div>
              ) : null}
              
              {/* Property name with orientation + multi-line support for railroads/utilities & multi-word */}
              {(() => {
                const isCorner = (t.x === 0 && t.y === 0) || (t.x === 10 && t.y === 0) || (t.x === 0 && t.y === 10) || (t.x === 10 && t.y === 10);
                const allowTwoLine = ['railroad', 'utility'].includes(String(t.type)) || /\s/.test(t.name.trim());
                const words = t.name.split(/\s+/);
                let displayLines: string[] = [t.name];
                if (allowTwoLine && words.length === 2) {
                  displayLines = [words[0], words[1]];
                } else if (allowTwoLine && words.length > 2) {
                  // put first word on first line, rest on second (fallback)
                  displayLines = [words[0], words.slice(1).join(' ')];
                }
                const singleLine = !allowTwoLine || displayLines.length === 1;
                const tileSize = 64;
                const maxWidth = tileSize - 8;
                const maxHeight = singleLine ? tileSize / 3 : tileSize / 2.2; // more vertical room for 2 lines
                const baseContent = displayLines.join(' ');
                const optimalBase = calculateOptimalFontSize(baseContent, maxWidth, maxHeight, isCorner);
                // Increase size a bit for two-line since each line shorter
                const fontSize = singleLine ? optimalBase : Math.min(optimalBase + 1, 14);
                const rotation = (() => {
                  if (isCorner) return 'translate(-50%, -50%) rotate(0deg)';
                  // Top row: keep upright (no 180 flip) per new spec
                  if (t.y === 0) return 'translate(-50%, -50%) rotate(0deg)';
                  if (t.y === 10) return 'translate(-50%, 0%) rotate(0deg)';
                  if (t.x === 0) return 'translate(-50%, -50%) rotate(90deg)';
                  if (t.x === 10) return 'translate(-50%, -50%) rotate(-90deg)';
                  return 'translate(-50%, -50%)';
                })();
                const posStyle = (() => {
                  if (t.y === 0) return { top: '50%', left: '50%' } as const;
                  if (t.y === 10) return { bottom: '24px', left: '50%' } as const;
                  if (t.x === 0) return { top: '50%', left: '50%' } as const;
                  if (t.x === 10) return { top: '50%', left: '50%' } as const;
                  return { top: '50%', left: '50%' } as const;
                })();
                return (
                  <div className="name" style={{ position: 'absolute', ...posStyle, transform: rotation, transformOrigin: 'center center', fontSize: `${fontSize}px`, fontWeight: t.name.includes('𝗦𝗧𝗔𝗥𝗧') ? 'bold' : 'normal', textShadow: t.name.includes('𝗦𝗧𝗔𝗥𝗧') ? '0 0 4px rgba(46, 204, 113, 0.8)' : undefined, whiteSpace: singleLine ? 'nowrap' : 'normal', textAlign: 'center', lineHeight: 1.05, zIndex: 2, padding: 0, maxWidth: 60, overflow: 'hidden' }}>
                    {singleLine ? t.name : (
                      <span style={{ display: 'inline-block', whiteSpace: 'pre-line' }}>
                        {displayLines.join('\n')}
                      </span>
                    )}
                  </div>
                );
              })()}
              
              {/* Enhanced ownership bar - replaces price at bottom edge when owned */}
              {ownerColor ? (() => {
                const rgb = (() => {
                  const c = ownerColor.replace('#','');
                  if (c.length === 3) return [parseInt(c[0]+c[0],16), parseInt(c[1]+c[1],16), parseInt(c[2]+c[2],16)];
                  return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
                })();
                const lum = (0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2]) / 255;
                const outline = lum > 0.55 ? '#222' : '#fafafa';
                return (
                  <div className="ownership-bar" style={{
                    position: 'absolute',
                    height: '8px',
                    background: ownerColor,
                    border: `1px solid ${outline}`,
                    borderRadius: '2px',
                    boxShadow: lum > 0.55 ? 'inset 0 0 0 1px rgba(0,0,0,0.15)' : '0 0 0 1px rgba(255,255,255,0.25)',
                    ...((() => {
                      if (t.y === 0) return { top: 0, left: '4px', right: '4px' } as const;
                      if (t.y === 10) return { bottom: 0, left: '4px', right: '4px' } as const;
                      if (t.x === 0) return { left: 0, top: '4px', bottom: '4px', width: '8px', height: 'auto' } as const;
                      if (t.x === 10) return { right: 0, top: '4px', bottom: '4px', width: '8px', height: 'auto' } as const;
                      return { bottom: 0, left: '4px', right: '4px' } as const;
                    })())
                  }} />
                );
              })() : null}
              
              {/* Price display when not owned - sharpened (no fade) with higher contrast */}
              {!ownerColor && (t.price || 0) > 0 ? (
                <div className="price-tag" style={{
                  position: 'absolute',
                  fontSize: '9px',
                  fontWeight: 600,
                  letterSpacing: '0.25px',
                  zIndex: 8,
                  textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                  color: 'var(--color-text)',
                  background: 'rgba(255,255,255,0.65)',
                  padding: '1px 3px',
                  borderRadius: 3,
                  backdropFilter: 'blur(2px)',
                  ...((() => {
                    // Position price to match text positioning and avoid flag overlap
                    if (t.y === 0) return { top: '20%', left: '50%', transform: 'translateX(-50%) rotate(0deg)' }; // top row upright
                    if (t.y === 10) return { bottom: '4px', left: '50%', transform: 'translateX(-50%)' }; // bottom row - positioned at bottom edge
                    if (t.x === 0) return { left: '2px', top: '50%', transform: 'translateY(-50%) rotate(90deg)' }; // left col - match text direction
                    if (t.x === 10) return { right: '2px', top: '50%', transform: 'translateY(-50%) rotate(-90deg)' }; // right col - match text direction
                    return { bottom: '2px', left: '50%', transform: 'translateX(-50%)' };
                  })())
                }}>
                  ${t.price}
                </div>
              ) : null}
              
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
          <div className="tokens" style={{ display: 'grid', gridTemplateColumns: gridTemplate, gridTemplateRows: gridTemplate, alignItems: 'center', justifyItems: 'center', gap: 4, zIndex: 6, position: 'relative' }}>
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
            {/* Players Overview — shifted left 45px and up 35px (spec) */}
            <div style={{ position: 'absolute', left: 'calc(50% - 130px)', top: 'calc(50% - 235px)', transform: 'translateX(-50%) scale(0.85)', pointerEvents: 'auto' }}>
                <div className="ui-labelframe" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, minWidth: 140, maxWidth: 200, color: 'var(--color-text)' }}>
                <div className="ui-title ui-h3" style={{ textAlign: 'center' }}>Players Overview</div>
                <div style={{ fontSize: 12, marginTop: 6, display: 'grid', gap: 6 }}>
                  {(snapshot?.players || []).map((p, i) => {
                    const disconnectRemain: Record<string, number> = (snapshot as any)?.disconnect_remain || ({} as any);
                    const remain = disconnectRemain[p.name];
                    const isDisc = typeof remain === 'number' && remain > 0;
                    
                    // Format timer display
                    const formatTime = (seconds: number) => {
                      const mins = Math.floor(seconds / 60);
                      const secs = seconds % 60;
                      return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
                    };
                    
                    return (
                      <div 
                        key={i} 
                        className={`list-item${i === (snapshot?.current_turn ?? -1) ? ' current' : ''} ${turnChangeAnimation && i === (snapshot?.current_turn ?? -1) ? 'animate-turn-highlight' : ''}`} 
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || 'var(--muted)', display: 'inline-block' }} />
                        <button className="btn btn-link" style={{ padding: 0 }} onClick={() => window.dispatchEvent(new CustomEvent('highlight-player', { detail: { name: p.name } }))} title="Highlight rents for this player's properties">{p.name}</button>
                        {isDisc && (
                          <div 
                            title={`Player disconnected - ${formatTime(remain)} remaining to reconnect`} 
                            className="disconnect-indicator"
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: 3, 
                              background: 'rgba(231, 76, 60, 0.15)', 
                              padding: '2px 6px', 
                              borderRadius: '8px',
                              border: '1px solid rgba(231, 76, 60, 0.4)',
                              animation: 'pulse 2s infinite',
                              fontSize: '10px',
                              fontWeight: 600,
                              color: '#e74c3c',
                              boxShadow: '0 2px 4px rgba(231, 76, 60, 0.2)',
                              backdropFilter: 'blur(2px)'
                            }}
                          >
                            <span style={{ fontSize: '12px' }}>📶</span>
                            <span style={{ opacity: 0.8 }}>❌</span>
                            <span>{formatTime(remain)}</span>
                          </div>
                        )}
                        <span 
                          style={{ marginLeft: 'auto' }} 
                          className={moneyAnimations[p.name] || ''}
                        >
                          ${p.cash}
                        </span>
                      </div>
                    );
                  })}
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
            {/* Game Log — shifted left 60px (was +150px) and up 35px (spec) */}
            <div style={{ position: 'absolute', left: 'calc(50% + 90px)', top: 'calc(50% - 235px)', transform: 'translateX(-50%) scale(0.85)', pointerEvents: 'auto' }}>
              <div className="ui-labelframe" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, width: 275, height: 225, display: 'flex', flexDirection: 'column', color: 'var(--color-text)' }}>
                <div className="ui-title ui-h3" style={{ textAlign: 'center' }}>Game Log</div>
                <div style={{ fontSize: 10, marginTop: 4, flex: 1, overflowY: 'auto', lineHeight: 1.25 }}>
                  {snapshot?.log && snapshot.log.length ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {snapshot.log.slice(-80).map((e: any, i: number) => (
                        <li key={i} style={{ padding: '2px 0', borderBottom: '1px dotted #e1e4e8' }}>
                          <span style={{ marginRight: 4 }}>
                            {e.type === 'rolled' ? '🎲' : e.type === 'buy' ? '🏠' : e.type === 'end_turn' ? '⏭' : e.type === 'bankrupt' ? '💥' : '•'}
                          </span>
                          {e.id && /^trade_/.test(String(e.type)) ? (
                            <button className="btn btn-link" style={{ padding: 0, fontSize: 10 }} onClick={() => window.dispatchEvent(new CustomEvent('open-trades'))} title={`Open trade ${e.id}`}>{e.text || JSON.stringify(e)}</button>
                          ) : (
                            <span style={{ fontSize: 10 }}>{e.text || JSON.stringify(e)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : <div style={{ opacity: 0.6 }}>No log entries.</div>}
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
              
              // Vote kick logic - can vote kick current turn holder if not me
              const currentTurnPlayer = (snapshot?.players || [])[snapshot?.current_turn ?? -1];
              const canVoteKick = !myTurn && currentTurnPlayer && snapshot?.players && snapshot.players.length > 2;
              
              return (
                <div style={{ position: 'absolute', left: '50%', top: 'calc(50% + 80px)', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
                  <button 
                    className={`btn btn-primary action-button ${diceAnimation}`} 
                    disabled={!canRollC} 
                    onClick={() => { 
                      playGameSound('dice_rolled'); 
                      setDiceAnimation('animate-dice-shake');
                      setTimeout(() => setDiceAnimation(''), 500);
                      act('roll_dice'); 
                    }}
                  >
                    🎲 Roll
                  </button>
                  <button 
                    className="btn btn-success action-button" 
                    disabled={!canBuyC} 
                    onClick={() => { 
                      playGameSound('property_purchased'); 
                      // Add property purchase animation
                      if (snapshot?.players?.[curIdx]?.position !== undefined) {
                        const pos = snapshot.players[curIdx].position;
                        setPropertyAnimations(prev => ({ ...prev, [pos]: 'animate-property-purchase' }));
                        setTimeout(() => {
                          setPropertyAnimations(prev => {
                            const updated = { ...prev };
                            delete updated[pos];
                            return updated;
                          });
                        }, 1000);
                      }
                      act('buy_property'); 
                    }}
                  >
                    🏠 Buy
                  </button>
                  <button className="btn btn-ghost action-button" disabled={!canEndC} onClick={() => {
                    playGameSound('turn_started', { 
                      currentPlayer: snapshot?.players?.[snapshot?.current_turn ?? -1]?.name,
                      myName: (getRemembered().displayName || '').trim()
                    });
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
                  
                  {canVoteKick && (
                    <button 
                      className="btn btn-warning" 
                      onClick={() => {
                        if (confirm(`Vote to kick ${currentTurnPlayer.name}? This requires majority approval.`)) {
                          s.emit('vote_kick', { 
                            id: lobbyId, 
                            target: currentTurnPlayer.name 
                          });
                        }
                      }}
                      title={`Vote to kick ${currentTurnPlayer.name} (majority required)`}
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    >
                      🚫 Vote Kick
                    </button>
                  )}
                  
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
                    {!chatOpen && unreadMessages > 0 && (
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
              // Trade / Advanced / Bankruptcy row — shifted down by ~10px and reduced size by ~10%
              const cur = snapshot?.players?.[snapshot?.current_turn ?? -1];
              const myName = meName || cur?.name || '';
              const players = (snapshot?.players || []).map(p => p.name).filter(n => n !== myName);
              const enableTrade = players.length >= 1;
              return (
                <div style={{ position: 'absolute', left: '50%', bottom: '115px', transform: 'translateX(-50%) scale(0.9)', display: 'flex', gap: 10, alignItems: 'stretch', pointerEvents: 'auto', background: 'var(--color-surface)', padding: '6px 10px', borderRadius: 10, boxShadow: '0 4px 14px var(--color-shadow)', border: '1px solid var(--color-border)' }}>
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
          background: 'var(--color-surface)', 
          boxShadow: '-4px 0 20px var(--color-shadow)', 
          display: 'flex', 
          flexDirection: 'column',
          zIndex: 2000,
          borderLeft: '1px solid var(--color-border)'
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
            <div 
              ref={chatMessagesRef}
              style={{ 
                flex: 1, 
                padding: '16px 20px', 
                overflowY: 'auto', 
                background: '#f8f9fa',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
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
                const alt = i % 2 === 0;
                const baseOtherLightA = '#e9ecef';
                const baseOtherLightB = '#dde3e8';
                const baseOtherDarkA = '#2a3540';
                const baseOtherDarkB = '#323f4a';
                const dark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
                const otherBg = dark ? (alt ? baseOtherDarkA : baseOtherDarkB) : (alt ? baseOtherLightA : baseOtherLightB);
                const bubbleStyle: any = {
                  maxWidth: '75%',
                  padding: '8px 12px',
                  borderRadius: '16px',
                  background: isMe ? 'var(--color-accent)' : otherBg,
                  color: isMe ? 'var(--color-accent-contrast)' : (dark ? 'var(--color-text)' : '#333'),
                  fontSize: 14,
                  wordBreak: 'break-word',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                };
                return (
                  <div key={i} style={{ 
                    display: 'flex', 
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: 4
                  }}>
                    <div style={bubbleStyle}>
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
            <div style={{ background: 'var(--color-surface)', minWidth: 320, maxWidth: '85vw', borderRadius: 8, padding: 12 }} onClick={(e) => e.stopPropagation()}>
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
