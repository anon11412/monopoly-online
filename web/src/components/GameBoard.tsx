import { useEffect, useMemo, useState, useRef } from 'react';
import { buildDefaultBoardTiles } from '../lib/boardFallback';
import TradePanel from './TradePanel';
import type { BoardTile, GameSnapshot, PropertyState, PropertyStateLike } from '../types';
import { buildPlayerColorMap } from '../lib/colors';
import { getSocket, getRemembered } from '../lib/socket';
import { equalNames } from '../lib/names';
import { getStreetRent, houseCostForGroup, mortgageValue, RAILROAD_RENTS } from '../lib/rentData';
import { playGameSound } from '../lib/audio';
import Portal from './Portal';
import ChatPanel from './ChatPanel';

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
  // Map of country code -> 'png' | 'svg' | null (asset availability)
  const [flagAssetOk, setFlagAssetOk] = useState<Record<string, 'png' | 'svg' | null>>({});
  const [openPropPos, setOpenPropPos] = useState<number | null>(null);
  const [highlightedPlayer, setHighlightedPlayer] = useState<string | null>(null);
  const [showTrade, setShowTrade] = useState(false);
  const [showTradeAdvanced, setShowTradeAdvanced] = useState(false);
  const [showPartnerPicker, setShowPartnerPicker] = useState<null | 'basic' | 'advanced'>(null);
  const [negativeBalanceError, setNegativeBalanceError] = useState<string | null>(null);
  // Keep a setter for money animations (UI no longer renders them here, but effects may update)
  const [, setMoneyAnimations] = useState<Record<string, string>>({});
  const [, setTurnChangeAnimation] = useState(false);
  const [propertyAnimations, setPropertyAnimations] = useState<Record<number, string>>({});
  const [diceAnimation, setDiceAnimation] = useState('');
  // Responsive: simple small-screen detector
  const [isSmall, setIsSmall] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.matchMedia('(max-width: 768px)').matches; } catch { return false; }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsSmall(mql.matches);
    try { mql.addEventListener('change', onChange); } catch { mql.addListener(onChange); }
    onChange();
    return () => { try { mql.removeEventListener('change', onChange); } catch { mql.removeListener(onChange); } };
  }, []);
  // (err placeholder removed) 
  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const gameLogRef = useRef<HTMLDivElement | null>(null);
  // Responsive: measure tile size to scale elements when not at baseline
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [tilePx, setTilePx] = useState<number>(64);
  const BASE_TILE = 64; // baseline constant in current layout
  // Widen tolerance so tiny measurement jitter doesn't change layout mode
  const baselineActive = useMemo(() => Math.abs(tilePx - BASE_TILE) <= 4, [tilePx]);
  const scale = useMemo(() => {
    const factor = tilePx / BASE_TILE;
    return (v: number) => Math.round(v * factor);
  }, [tilePx]);
  useEffect(() => {
    if (!gridRef.current) return;
    const el = gridRef.current;
    const ro = new ResizeObserver(() => {
      try {
        // Find one tile to measure
        const tile = el.querySelector('.board-tile') as HTMLElement | null;
        if (tile) {
          const r = tile.getBoundingClientRect();
          const size = Math.max(1, Math.round(r.width));
          setTilePx(size);
        }
      } catch {}
    });
    ro.observe(el);
    return () => { try { ro.disconnect(); } catch {} };
  }, []);
  // Vote kick banner
  const [kickBanner, setKickBanner] = useState<{ target?: string | null; votes?: number; required?: number; remaining?: number }>({});
  // Helpers to remember previous sets for unread counts
  const prevTradeIdsRef = useRef<Set<string>>(new Set());
  const prevLastActionRef = useRef<string | null>(null);
  
  // Simple stored name - back to basics
  const storedName = (getRemembered().displayName || '').trim();
  
  const meName = useMemo(() => {
    if (!storedName) return '';
    // Resolve using normalized comparison to tolerate suffixes like "(2)" and minor differences
    const found = (snapshot?.players || []).find(p => equalNames(p.name, storedName));
    return found?.name || storedName;
  }, [snapshot?.players, storedName]);

  // Derived: am I the current turn holder?
  const isMyTurn = useMemo(() => {
    const cur = (snapshot?.players || [])[snapshot?.current_turn ?? -1];
    return equalNames(cur?.name || '', meName || '');
  }, [snapshot?.players, snapshot?.current_turn, meName]);

  // Lag-spike recovery: if it's my turn but UI shows 0 rolls_left and not rolled yet,
  // request a lobby rejoin to hydrate a fresh snapshot.
  useEffect(() => {
    if (!s.connected) return;
    const rl = snapshot?.rolls_left ?? 0;
    const rolled = !!snapshot?.rolled_this_turn;
    if (isMyTurn && rl === 0 && !rolled) {
      try { s.emit('lobby_join', { id: lobbyId, lobby_id: lobbyId }); } catch {}
    }
  }, [s, isMyTurn, snapshot?.rolls_left, snapshot?.rolled_this_turn, lobbyId]);

  // Helper: map flag emoji to ISO code for asset lookups (e.g., 🇺🇸 -> us)
  const flagToCode = (flag: string): string | null => {
    try {
      if (!flag) return null;
      const codePoints = Array.from(flag)
        .map(c => c.codePointAt(0) || 0)
        .filter(cp => cp >= 0x1F1E6 && cp <= 0x1F1FF)
        .map(cp => String.fromCharCode(cp - 0x1F1E6 + 0x41))
        .join('');
      return codePoints ? codePoints.toLowerCase() : null;
    } catch { return null; }
  };

  // Load tiles from snapshot or fallback
  useEffect(() => {
    const snapTiles: any[] | undefined = (snapshot as any)?.tiles;
    if (Array.isArray(snapTiles) && snapTiles.length > 0) {
      setTiles(snapTiles as BoardTile[]);
    } else if (tiles.length === 0) {
      setTiles(buildDefaultBoardTiles());
    }
  }, [(snapshot as any)?.tiles]);

  // Detect which flag assets exist; use assets ONLY when confirmed present
  useEffect(() => {
    let cancelled = false;
    // unique ISO codes from current tiles
    const codeList = (tiles || [])
      .map(t => (t as any)?.flag as string | null | undefined)
      .filter((f): f is string => !!f)
      .map((f: string) => {
        try {
          const s = String(f);
          const cps = Array.from(s)
            .map(c => c.codePointAt(0) || 0)
            .filter(cp => cp >= 0x1F1E6 && cp <= 0x1F1FF)
            .map(cp => String.fromCharCode(cp - 0x1F1E6 + 0x41))
            .join('');
          return cps ? cps.toLowerCase() : null;
        } catch { return null; }
      })
      .filter((x): x is string => !!x);
    const codes = Array.from(new Set<string>(codeList));

    const toCheck = codes.filter(c => !(c in flagAssetOk));
    if (toCheck.length === 0) return;

    toCheck.forEach(code => {
      // Try PNG first
      const imgPng = new Image();
      imgPng.onload = () => {
        if (cancelled) return;
        setFlagAssetOk(prev => (prev[code] ? prev : { ...prev, [code]: 'png' }));
      };
      imgPng.onerror = () => {
        // Try SVG
        const imgSvg = new Image();
        imgSvg.onload = () => {
          if (cancelled) return;
          setFlagAssetOk(prev => (prev[code] ? prev : { ...prev, [code]: 'svg' }));
        };
        imgSvg.onerror = () => {
          if (cancelled) return;
          setFlagAssetOk(prev => (prev[code] ? prev : { ...prev, [code]: null }));
        };
        imgSvg.src = `/flags/${code}.svg`;
      };
      imgPng.src = `/flags/${code}.png`;
    });

    return () => { cancelled = true; };
  }, [tiles, flagAssetOk]);

  // Highlight player event (used for rent highlight logic)
  useEffect(() => {
    const onHi = (e: any) => setHighlightedPlayer(e.detail?.name || null);
    window.addEventListener('highlight-player' as any, onHi);
    return () => window.removeEventListener('highlight-player' as any, onHi);
  }, []);

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

  // Chat: only track unread counts when closed; ChatPanel handles UI and history
  useEffect(() => {
    const onChat = () => {
      if (!chatOpen) setUnreadMessages(u => u + 1);
    };
    s.on('chat_message', onChat);
    return () => { s.off('chat_message', onChat); };
  }, [s, chatOpen]);

  // Rejoin for chat history handled by ChatPanel when opened

  // Lobby updates: vote kick banner
  useEffect(() => {
    const onLobbyState = (l: any) => {
      const votesCount = (typeof l.kick_votes_count === 'number')
        ? l.kick_votes_count
        : (l.kick_target && l.kick_votes && Array.isArray(l.kick_votes[l.kick_target]) ? l.kick_votes[l.kick_target].length : 0);
      setKickBanner({ target: l.kick_target, votes: votesCount, required: l.kick_required, remaining: l.kick_remaining });
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

  // Input focus/scroll handled within shared panel. We keep unread only.

  // Auto-scroll game log
  useEffect(() => {
    if (gameLogRef.current) {
      gameLogRef.current.scrollTop = gameLogRef.current.scrollHeight;
    }
  }, [snapshot?.log]);

  // Chat sending moved into shared panel; we only track unread and hydrate here.

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
  const act = (type: string, payload: any = {}) => {
    const finalLobbyId = lobbyId || (window as any).__lobbyId || '';
    const actionData = { id: finalLobbyId, action: { type, ...payload } };
    console.log('Sending game action:', actionData);
    s.emit('game_action', actionData, (response: any) => {
      console.log('Game action response:', response);
      if (response && response.ok === false) {
        console.error('Game action failed:', response);
        alert(`Action failed: ${response.error || 'Unknown error'}`);
      }
    });
  };
  // No embedded panels here; board-only visuals
  

  return (
    <div className="board" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
  {/* error banner removed (no err state) */}
  <div style={{ padding: '4px 6px', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Turn: {curName || '—'}</div>
      <div className="board-wrap" style={{ position: 'relative' }}>
  <div className="grid" ref={gridRef}>
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
          // owner marker edge hint was unused; removed to prevent overlay issues
          
          return (
            <div 
              key={t.pos} 
              className={`tile type-${t.type || 'prop'} board-tile ${propertyAnimations[t.pos] || ''}`} 
              data-corner={(t.x === 0 && t.y === 0) || (t.x === 10 && t.y === 0) || (t.x === 0 && t.y === 10) || (t.x === 10 && t.y === 10)}
              style={{ gridColumn: t.x + 1, gridRow: t.y + 1, outline: isCurrent ? '2px solid #f1c40f' : undefined, cursor: clickable ? 'pointer' : undefined }} 
              onClick={() => clickable ? setOpenPropPos(t.pos) : undefined}
            >
              {/* Flag background overlay removed to avoid flicker; circle badge remains below */}
              
              {/* Flag circle for properties - positioned on inner edge (emoji fallback if asset missing) */}
              {t.type === 'property' && t.flag ? (() => {
                const code = flagToCode(t.flag);
                const off = baselineActive ? 16 : scale(16);
                const posStyle = (() => {
                  if (t.y === 0) return { bottom: `-${off}px`, left: '50%', transform: 'translateX(-50%)' } as const;
                  if (t.y === 10) return { top: `-${off}px`, left: '50%', transform: 'translateX(-50%)' } as const;
                  if (t.x === 0) return { right: `-${off}px`, top: '50%', transform: 'translateY(-50%)' } as const;
                  if (t.x === 10) return { left: `-${off}px`, top: '50%', transform: 'translateY(-50%)' } as const;
                  return { bottom: `-${off}px`, left: '50%', transform: 'translateX(-50%)' } as const;
                })();
                const choice = code ? flagAssetOk[code] : null;
                const circleSrc = code && choice ? `/flags/${code}.${choice}` : null;
                return (
                  <div className="flag-circle" style={{ position: 'absolute', width: baselineActive ? 32 : scale(32), height: baselineActive ? 32 : scale(32), borderRadius: '50%', background: 'white', border: '2px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: baselineActive ? 16 : Math.max(10, Math.round((baselineActive ? 32 : scale(32)) * 0.5)), zIndex: 5, overflow: 'hidden', ...posStyle }}>
                    {circleSrc ? <img src={circleSrc} alt={t.flag} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{t.flag}</span>}
                  </div>
                );
              })() : null}
              
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
                const tileSize = baselineActive ? 64 : tilePx;
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
          fontSize: baselineActive ? '9px' : `${Math.max(8, Math.min(14, scale(9)))}px`,
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
              
              {/* Ownership dots removed (ownership bars provide the indicator) */}
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
          <div className="tokens" style={{ display: 'grid', gridTemplateColumns: gridTemplate, gridTemplateRows: gridTemplate, alignItems: 'center', justifyItems: 'center', gap: 4, zIndex: 20, position: 'relative' }}>
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
          {/* Dice overlay: baseline-only positioning */}
          <div style={{ position: 'absolute', left: '50%', top: 'calc(50% + 40px)', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
              <span className="badge badge-muted" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{lastRoll ? lastRoll.d1 : '–'}</span>
              <span className="badge badge-muted" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{lastRoll ? lastRoll.d2 : '–'}</span>
            </div>
          </div>
          {/* Unified controls layer: contains trade controls and core action controls */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
            {/* Players Overview moved to ActionPanel top */}
            {/* Game Log — centered horizontally, shifted down ~15px */}
            <div style={{ position: 'absolute', left: '50%', top: 'calc(50% - 220px)', transform: 'translateX(-50%) scale(0.85)', pointerEvents: 'auto' }}>
              <div className="ui-labelframe" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, width: 275, height: 225, display: 'flex', flexDirection: 'column', color: 'var(--color-text)' }}>
                <div className="ui-title ui-h3" style={{ textAlign: 'center' }}>Game Log</div>
                <div ref={gameLogRef} style={{ fontSize: 10, marginTop: 4, flex: 1, overflowY: 'auto', lineHeight: 1.25 }}>
                  {snapshot?.log && snapshot.log.length ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {snapshot.log.slice(-80).map((e: any, i: number) => (
                        <li key={i} style={{ padding: '2px 0', borderBottom: '1px dotted #e1e4e8' }}>
                          <span style={{ marginRight: 4 }}>
                            {e.type === 'rolled' ? '🎲' : e.type === 'buy' ? '🏠' : e.type === 'end_turn' ? '⏭' : e.type === 'bankrupt' ? '💥' : '•'}
                          </span>
                          {e.id && (/^trade_/.test(String(e.type)) || /^rental_/.test(String(e.type))) ? (
                            <button className="btn btn-link" style={{ padding: 0, fontSize: 10 }} onClick={() => {
                              // For completed trades, just show the trade details in the log text
                              // For active trades, open the trades panel
                              const activeTrade = snapshot?.pending_trades?.find((t: any) => t.id === e.id);
                              if (activeTrade) {
                                window.dispatchEvent(new CustomEvent('open-trades'));
                              } else {
                                alert(`Trade ${e.id}: ${e.text}\n\nThis trade has been completed and is no longer active.`);
                              }
                            }} title={`Trade ${e.id} details`}>{e.text || JSON.stringify(e)}</button>
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
              const myTurn = equalNames(me?.name || '', meName || '');
              const rolledThisTurn = !!snapshot?.rolled_this_turn;
              const rollsLeft = snapshot?.rolls_left ?? 0;
              
              // More permissive fallback - if meName is empty or no players matched, allow the first player to act
              const fallbackMyTurn = !meName || (!myTurn && snapshot?.players?.length === 1);
              const finalMyTurn = myTurn || fallbackMyTurn;
              
              const canRollC = finalMyTurn && (!rolledThisTurn || rollsLeft > 0);
              
              // Debug logging (remove after testing)
              if (import.meta.env.DEV) {
                console.log('Button Debug:', {
                  me: me?.name,
                  meName,
                  myTurn,
                  fallbackMyTurn,
                  finalMyTurn,
                  rolledThisTurn,
                  rollsLeft,
                  canRollC,
                  storedName,
                  currentTurn: snapshot?.current_turn,
                  players: snapshot?.players?.map(p => p.name)
                });
              }
              
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
                    canBuyC = !!buyable && finalMyTurn;
                  }
                }
              }
              const canEndC = finalMyTurn && rolledThisTurn && rollsLeft === 0 && (me?.cash ?? 0) >= 0;
              
              // Always anchor roll/buy/end row relative to board
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
                      if (me?.position !== undefined) {
                        const pos = me.position;
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
                      myName: meName
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
                  }} title={(!canEndC ? ((me?.cash ?? 0) < 0 ? 'Cannot end turn: negative balance' : 'Need roll or extra rolls left') : 'End your turn')}>⏭ End Turn</button>
                  
                  {/* Vote Kick moved to bottom bar */}
                  
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
            {/* Removed mobile bottom bar; unified anchored controls */}
            {(() => {
              // Trade / Advanced / Bankruptcy row — shifted down by ~10px and reduced size by ~10%
              if (isSmall) return null;
              const cur = snapshot?.players?.[snapshot?.current_turn ?? -1];
              const myName = meName || cur?.name || '';
              const players = (snapshot?.players || []).map(p => p.name).filter(n => n !== myName);
              const enableTrade = players.length >= 1;
              const currentTurnPlayer = (snapshot?.players || [])[snapshot?.current_turn ?? -1];
              const canVoteKick = currentTurnPlayer && currentTurnPlayer.name !== myName && (snapshot?.players?.length || 0) > 2;
              return (
                <div style={{ position: 'absolute', left: '50%', bottom: '115px', transform: 'translateX(-50%) scale(0.9)', display: 'flex', gap: 10, alignItems: 'stretch', pointerEvents: 'auto', background: 'var(--color-surface)', padding: '6px 10px', borderRadius: 10, boxShadow: '0 4px 14px var(--color-shadow)', border: '1px solid var(--color-border)' }}>
                  <button className="btn btn-trade" style={{ minWidth: 110 }} disabled={!enableTrade} onClick={() => setShowPartnerPicker('basic')} title="Create a standard property/cash trade">🤝 Trade</button>
                  <button className="btn btn-advanced" style={{ minWidth: 140 }} disabled={!enableTrade} onClick={() => setShowPartnerPicker('advanced')} title="Open advanced combined trade (recurring terms)">⚡ Advanced</button>
                  <div style={{ width: 1, background: 'rgba(0,0,0,0.15)', margin: '0 2px' }} />
                  <button className="btn btn-danger" style={{ minWidth: 120 }} onClick={() => act('bankrupt')} title="Declare bankruptcy">💥 Bankruptcy</button>
                  {canVoteKick ? (
                    <>
                      <div style={{ width: 1, background: 'rgba(0,0,0,0.15)', margin: '0 2px' }} />
                      <button 
                        className="btn btn-warning" 
                        onClick={() => {
                          if (confirm(`Vote to kick ${currentTurnPlayer!.name}? This requires majority approval.`)) {
                            s.emit('vote_kick', { id: lobbyId, target: currentTurnPlayer!.name });
                          }
                        }}
                        title={`Vote to kick ${currentTurnPlayer!.name} (majority required)`}
                        style={{ minWidth: 130 }}
                      >
                        🚫 Vote Kick
                      </button>
                      {kickBanner?.target === currentTurnPlayer!.name && typeof kickBanner.remaining === 'number' && (
                        <span className="badge" title="Kick timer" style={{ alignSelf: 'center' }}>
                          ⏰ {Math.floor((kickBanner.remaining as number)/60)}:{String((kickBanner.remaining as number)%60).padStart(2,'0')} · {kickBanner.votes || 0}/{kickBanner.required || 1}
                        </span>
                      )}
                    </>
                  ) : null}
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
      <Portal>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2500 }} onClick={() => setShowPartnerPicker(null)}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 8, padding: 12, minWidth: 320, color: 'var(--color-text)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{showPartnerPicker === 'advanced' ? 'Choose partner for Advanced Trade' : 'Choose partner for Trade'}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {others.length === 0 ? <div style={{ opacity: 0.7 }}>No other players.</div> : others.map((n, i) => (
                <button key={i} className="btn" onClick={() => pick(n)} title={n}>{n}</button>
              ))}
            </div>
          </div>
        </div>
      </Portal>
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
      {!isSmall && chatOpen && (
        <Portal>
          <div style={{ position: 'fixed', top: 0, right: 0, width: 'min(400px, 40vw)', height: '100vh', background: 'var(--color-surface)', boxShadow: '-4px 0 20px var(--color-shadow)', display: 'flex', flexDirection: 'column', zIndex: 2500, borderLeft: '1px solid var(--color-border)' }}>
            <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>💬 Game Chat</h3>
              <button onClick={handleChatToggle} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: 8 }}>
              <ChatPanel lobbyId={lobbyId} />
            </div>
          </div>
        </Portal>
      )}
      {isSmall && chatOpen && (
        <Portal>
          <div className="chat-sheet" style={{ zIndex: 2500 }}>
            <div className="sheet-header">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>💬 Game Chat</h3>
              <button onClick={handleChatToggle} className="btn btn-ghost" style={{ padding: '6px 10px' }}>✕</button>
            </div>
            <div className="sheet-body" style={{ padding: 8 }}>
              <ChatPanel lobbyId={lobbyId} />
            </div>
          </div>
        </Portal>
      )}
  {openPropPos != null ? (() => {
        const t = tileByPos[openPropPos!];
  const p = normalize(openPropPos!, props[openPropPos as any]);
        const owner = p?.owner;
  const price = (t as any)?.price ?? 0;
  // Buy button moved to central action bar; evaluate there
        return (
          <Portal>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2500 }} onClick={() => setOpenPropPos(null)}>
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
          </Portal>
        );
      })() : null}

      {/* Negative Balance Error Modal */}
  {negativeBalanceError ? (
    <Portal>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2600 }} onClick={() => setNegativeBalanceError(null)}>
        <div style={{ 
            background: 'var(--color-surface)', 
            color: 'var(--color-text)',
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
    </Portal>
  ) : null}
    </div>
  );
}
