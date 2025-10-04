import { useEffect, useMemo, useState, useRef } from 'react';
import { getSocket, rememberLobby } from '../lib/socket';
import type { LobbyInfo } from '../types';
import { spawnBot, type BotHandle } from '../lib/bots';
import { normalizeName } from '../lib/names';

type Props = {
  lobby: LobbyInfo;
  onGameStarted: () => void;
  onBackToMenu?: () => void;
};

export default function LobbyRoom({ lobby, onGameStarted, onBackToMenu }: Props) {
  const [state, setState] = useState<LobbyInfo>(lobby);
  const [colorModalOpen, setColorModalOpen] = useState(false);
  const [colorTarget, setColorTarget] = useState<string | null>(null);
  const [chat, setChat] = useState<Array<{message: string, timestamp: Date}>>([]);
  const [msg, setMsg] = useState('');
  const [bots, setBots] = useState<BotHandle[]>([]);
  const [botError, setBotError] = useState<string>('');
  const [startMsg, setStartMsg] = useState<string>('');
  const [startPending, setStartPending] = useState<boolean>(false);
  // Local disconnect countdown state (seconds), separate from raw lobby_state
  const [disconnectRemainLocal, setDisconnectRemainLocal] = useState<Record<string, number>>({});
  
  // Animation state tracking for player join/leave
  const [prevPlayerNames, setPrevPlayerNames] = useState<Set<string>>(new Set());
  
  // Responsive layout tracking
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Chat auto-scroll
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  
  // Handle window resize for responsive layout
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  useEffect(() => {
  rememberLobby(state.id);
    const s = getSocket();
    const onLobbyState = (data: any) => {
      if (data?.id === state.id) setState(data);
      if (data?.id === state.id && Array.isArray((data as any).chat)) {
        setChat((data as any).chat.map((c: any) => ({
          message: `${normalizeName(c.from || 'anon')}: ${c.message}`,
          timestamp: new Date(c.timestamp || Date.now())
        })));
      }
      if (data?.id === state.id) {
        if (data.disconnect_remain && typeof data.disconnect_remain === 'object') {
          // Initialize/refresh local countdown seconds from server authoritative map.
          // Only copy keys present in the incoming object so that removed players (reconnected or timed out)
          // disappear immediately from the local countdown state.
          try {
            const map = data.disconnect_remain as Record<string, number>;
            const next: Record<string, number> = {};
            Object.keys(map).forEach(k => { next[k] = Math.max(0, Math.floor(map[k])); });
            setDisconnectRemainLocal(next);
          } catch {}
        } else {
          // If the server omits disconnect_remain entirely for this lobby state, treat it as no active
          // disconnect timers (e.g. a fast reconnect cleared the only pending entry). Clear local state
          // so any lingering countdown badges vanish instantly.
            setDisconnectRemainLocal({});
        }
      }
    };
  // Stop listening to legacy lobby_chat to avoid duplicate chat messages.
    const onGameState = (payload: any) => {
      if (payload?.lobby_id === state.id) onGameStarted();
    };
    const onChatMessage = (msg: any) => {
      try {
        if (!msg) return;
        const lobbyId = msg.lobby_id || msg.id;
        if (lobbyId !== state.id) return;
        const from = normalizeName(msg.from || 'anon');
        const text = String(msg.message || '');
        if (!text) return;
        setChat(prev => [...prev, {
          message: `${from}: ${text}`,
          timestamp: new Date()
        }]);
      } catch {}
    };
    s.on('lobby_state', onLobbyState);
    s.on('game_state', onGameState);
    s.on('chat_message', onChatMessage);
    return () => {
      s.off('lobby_state', onLobbyState);
  // legacy lobby_chat listener removed
      s.off('game_state', onGameState);
      s.off('chat_message', onChatMessage);
    };
  }, [state.id, onGameStarted]);

  // Drive local per-second countdown without server spam
  useEffect(() => {
    const t = setInterval(() => {
      setDisconnectRemainLocal(prev => {
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

  // Track player changes for animations
  useEffect(() => {
  const currentPlayerNames = new Set((state.players || []).map(name => name));
  // (Player join/leave animations removed for simplification)
    
    setPrevPlayerNames(currentPlayerNames);
  }, [state.players, prevPlayerNames]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chat]);

  function setReady(ready: boolean) {
    const s = getSocket();
    s.emit('lobby_ready', { id: state.id, ready });
  }

  function sendChat() {
    const s = getSocket();
    if (msg.trim()) s.emit('chat_send', { id: state.id, message: msg.trim() });
    setMsg('');
  }

  function handleLeaveLobby() {
    const s = getSocket();
    // Leave the Socket.IO room to stop receiving lobby updates
    try {
      s.emit('leave_room', { room: state.id });
    } catch (e) {
      console.warn('Failed to emit leave_room:', e);
    }
    // Disconnect and reconnect to fully clean up state
    try {
      s.disconnect();
      // Small delay before calling onBackToMenu to ensure disconnect processes
      setTimeout(() => {
        s.connect();
        if (onBackToMenu) onBackToMenu();
      }, 100);
    } catch (e) {
      console.warn('Error during lobby leave:', e);
      if (onBackToMenu) onBackToMenu();
    }
  }

  function startGame() {
    const s = getSocket();
    if (!isHost) {
      setStartMsg('Only host can start');
      return;
    }
    setStartMsg('Starting…');
    setStartPending(true);
    let timeout: any;
    const onGame = (payload: any) => {
      if (payload?.lobby_id === state.id) {
        cleanup();
        setStartMsg('');
      }
    };
    const cleanup = () => {
      setStartPending(false);
      s.off('game_state', onGame);
      if (timeout) clearTimeout(timeout);
    };
    s.on('game_state', onGame);
    timeout = setTimeout(() => {
      setStartMsg('No game update received. If all are ready, try again.');
      cleanup();
    }, 5000);
    s.emit('lobby_start', { id: state.id }, (resp: any) => {
      if (resp && resp.ok === false) {
        setStartMsg(resp.error || 'Start rejected by server');
        cleanup();
      }
    });
  }

  const sidToName = state.players_map || {};
  const authedNamesArr: string[] = (state as any).authed_names || [];
  const authedSet = new Set(authedNamesArr);
  const disconnectRemain = disconnectRemainLocal;
  const kickVotes = (state as any).kick_votes || {} as Record<string, string[]>;
  const hasSidMap = Object.keys(sidToName).length > 0;
  type PlayerRow = { sid?: string; name: string };
  const playersBySid: PlayerRow[] = hasSidMap ? Object.entries(sidToName).map(([sid, name]) => ({ sid, name })) : [];
  const playersByName: PlayerRow[] = !hasSidMap ? (state.players || []).map((name) => ({ name })) : [];
  // Merge in any names not present in sid map (e.g., server bots or disconnected players), then dedupe by display name
  const mergedPlayers: PlayerRow[] = useMemo(() => {
    const list: PlayerRow[] = hasSidMap ? (() => {
      const byName = new Set(playersBySid.map(p => p.name));
      const extras: PlayerRow[] = (state.players || []).filter(n => !byName.has(n)).map(name => ({ name }));
      return [...playersBySid, ...extras];
    })() : playersByName;
    const seen = new Set<string>();
    const unique: PlayerRow[] = [];
    for (const p of list) {
      if (p && typeof p.name === 'string' && !seen.has(p.name)) {
        seen.add(p.name);
        unique.push(p);
      }
    }
    return unique;
  }, [hasSidMap, playersBySid, playersByName, state.players]);
  const botSet = useMemo(() => new Set(state.bots || []), [state.bots]);
  const readySet = useMemo(() => new Set(state.ready || []), [state.ready]);
  const premiumSet = useMemo(() => new Set((state.premium_players || []) as string[]), [state.premium_players]);
  const players = mergedPlayers;
  const readyCount = hasSidMap
    ? mergedPlayers.filter((p) => p.sid && readySet.has(p.sid!)).length
    : mergedPlayers.filter((p) => readySet.has(p.name)).length;
  const allReady = players.length > 0 && readyCount === players.length;
  const isHost = state.host_sid ? (getSocket().id === state.host_sid) : true;
  const startReason = !isHost ? 'Only host can start' : (!allReady ? 'All players must be ready' : 'Start the game');
  const playerColors = (state as any).player_colors || {} as Record<string,string>;

  return (
    <div className="lobby-room" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      {/* Vote Kick Banner - Full Width */}
      {(state as any).kick_target && (
        <div style={{
          background: '#ffebcd',
          border: '2px solid #ffa500',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>
            VOTE KICK ACTIVE
          </div>
          <div style={{ fontSize: 13 }}>
            Target: <strong>{(state as any).kick_target}</strong> | 
            Votes: <strong>{((state as any).kick_votes?.[(state as any).kick_target] || []).length}/{Math.floor(players.length / 2) + 1}</strong> | 
            Time: <strong>{Math.max(0, Math.floor(((state as any).kick_remaining || 0)))}s</strong>
          </div>
        </div>
      )}
      
      {/* Header - Full Width */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2>Lobby: {state.name}</h2>
        {onBackToMenu && (
          <button 
            className="btn btn-ghost" 
            onClick={handleLeaveLobby}
            style={{ padding: '6px 12px', fontSize: 14 }}
          >
            ← Back to Menu
          </button>
        )}
      </div>

      {/* Two Column Layout - responsive: stacks on mobile */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', 
        gap: isMobile ? '16px' : '32px', 
        alignItems: 'start',
        minHeight: isMobile ? 'auto' : '600px'
      }}>
        
        {/* Left Column - Lobby Controls */}
        <div className="lobby-controls">
          <div className="players">
            <h3>Players</h3>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.9 }}>
              Ready: {readyCount}/{players.length}
            </div>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.9 }}>
              Host: {state.host_sid ? (getSocket().id === state.host_sid ? 'You' : 'Other') : 'Unknown'}
            </div>
            <ul>
          {hasSidMap ? (
            mergedPlayers.map((p) => {
              const hasSid = typeof p.sid === 'string' && p.sid.length > 0;
              const isReady = hasSid ? readySet.has(p.sid!) : false;
              const isHostRow = hasSid && p.sid === state.host_sid;
              const isBot = botSet.has(p.name);
              const votes = kickVotes[p.name] ? kickVotes[p.name].length : 0;
              const total = (state.players || []).filter(n => !(state.bots || []).includes(n)).length;
              const self = getSocket().id === p.sid;
              const remain = disconnectRemain[p.name] ? Math.max(0, Math.ceil(disconnectRemain[p.name])) : 0;
              const assignedColor = playerColors[p.name];
              return (
                <li key={`${p.sid || p.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: isBot ? 0.9 : 1 }}>
                  <span className={`dot ${isReady ? 'ready' : 'not-ready'}`} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {assignedColor ? (
                      <span title="color" style={{ width: 12, height: 12, borderRadius: '50%', background: assignedColor, display: 'inline-block', border: '1px solid rgba(0,0,0,0.5)' }} />
                    ) : null}
                    {premiumSet.has(p.name) ? <span title="Premium token owner">🪙</span> : null}
                    {p.name}{authedSet.has(p.name) ? ' ✅' : ''}{isHostRow ? ' (host)' : ''}{isBot ? ' [BOT]' : ''}{remain ? ` (reconnect: ${remain}s)` : ''}
                  </span>
                  <span className={`badge ${isReady ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: 'auto' }}>{isReady ? 'Ready' : 'Not Ready'}</span>
                  {/* Self-only: open modal to choose color */}
                  {(!isBot) && (p.sid && p.sid === getSocket().id) ? (
                    <button
                      className="btn btn-ghost"
                      title="Choose Color"
                      onClick={() => { setColorTarget(p.name); setColorModalOpen(true); }}
                      style={{ marginLeft: 8 }}
                    >
                      🎨 Choose Color
                    </button>
                  ) : null}
                  {!self && !isBot ? (
                    <button 
                      className="btn btn-ghost" 
                      title={isHost ? 'Kick player (instant)' : `Vote kick (${votes}/${Math.floor(total/2)+1})`} 
                      onClick={() => {
                        const s = getSocket();
                        s.emit('vote_kick', { id: state.id, target: p.name });
                      }}
                      style={{ 
                        color: isHost ? '#e74c3c' : undefined,
                        fontWeight: isHost ? 600 : undefined 
                      }}
                    >
                      {isHost ? '🚫' : '👎'}
                    </button>
                  ) : null}
                  {votes ? <span className="badge" title="Votes">{votes}</span> : null}
                </li>
              );
            })
          ) : (
            playersByName.map((p, idx) => {
              const isReady = readySet.has(p.name);
              const isBot = botSet.has(p.name);
              const votes = kickVotes[p.name] ? kickVotes[p.name].length : 0;
              const total = (state.players || []).filter(n => !(state.bots || []).includes(n)).length;
              const self = false;
              const remain = disconnectRemain[p.name] ? Math.max(0, Math.ceil(disconnectRemain[p.name])) : 0;
              const assignedColor = playerColors[p.name];
              return (
                <li key={`${p.name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: isBot ? 0.9 : 1 }}>
                  <span className={`dot ${isReady ? 'ready' : 'not-ready'}`} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {assignedColor ? (
                      <span title="color" style={{ width: 12, height: 12, borderRadius: '50%', background: assignedColor, display: 'inline-block', border: '1px solid rgba(0,0,0,0.5)' }} />
                    ) : null}
                    {premiumSet.has(p.name) ? <span title="Premium token owner">🪙</span> : null}
                    {p.name}{authedSet.has(p.name) ? ' ✅' : ''}{isBot ? ' [BOT]' : ''}{remain ? ` (reconnect: ${remain}s)` : ''}
                  </span>
                  <span className={`badge ${isReady ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: 'auto' }}>{isReady ? 'Ready' : 'Not Ready'}</span>
                  {/* Name-only list: cannot identify self, so no color change controls */}
                  {!self && !isBot ? (
                    <button 
                      className="btn btn-ghost" 
                      title={isHost ? 'Kick player (instant)' : `Vote kick (${votes}/${Math.floor(total/2)+1})`} 
                      onClick={() => {
                        const s = getSocket();
                        s.emit('vote_kick', { id: state.id, target: p.name });
                      }}
                      style={{ 
                        color: isHost ? '#e74c3c' : undefined,
                        fontWeight: isHost ? 600 : undefined 
                      }}
                    >
                      {isHost ? '🚫' : '👎'}
                    </button>
                  ) : null}
                  {votes ? <span className="badge" title="Votes">{votes}</span> : null}
                </li>
              );
            })
          )}
        </ul>
          </div>
          
          {isHost && (
            <div className="host-settings" style={{ marginBottom: 16 }}>
              <h3>Game Settings</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <label htmlFor="starting-cash" style={{ minWidth: 120 }}>Starting Cash:</label>
                <select 
                  id="starting-cash"
                  value={state.starting_cash || 1500}
                  onChange={(e) => {
                    const amount = parseInt(e.target.value);
                    const s = getSocket();
                    s.emit('lobby_setting', { id: state.id, setting: 'starting_cash', value: amount });
                  }}
                  style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
                >
                  <option value={500}>$500</option>
                  <option value={1000}>$1,000</option>
                  <option value={1500}>$1,500 (Standard)</option>
                  <option value={2000}>$2,000</option>
                  <option value={2500}>$2,500</option>
                  <option value={5000}>$5,000</option>
                  <option value={10000}>$10,000</option>
                  <option value={25000}>$25,000</option>
                </select>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                Custom amount (1-25000): 
                <input 
                  type="number" 
                  min="1" 
                  max="25000" 
                  value={state.starting_cash || 1500}
                  onChange={(e) => {
                    const amount = Math.max(1, Math.min(25000, parseInt(e.target.value) || 1500));
                    const s = getSocket();
                    s.emit('lobby_setting', { id: state.id, setting: 'starting_cash', value: amount });
                  }}
                  style={{ 
                    width: 80, 
                    marginLeft: 8, 
                    padding: '2px 6px', 
                    borderRadius: 3, 
                    border: '1px solid #ccc' 
                  }}
                />
              </div>
            </div>
          )}
          
          <div className="controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button 
              className="btn btn-success" 
              onClick={() => setReady(true)}
              style={{ padding: '8px 16px', fontWeight: 600 }}
            >
              ✓ I'm Ready
            </button>
            <button 
              className="btn btn-warning" 
              onClick={() => setReady(false)}
              style={{ padding: '8px 16px', fontWeight: 600 }}
            >
              ⏸ Unready
            </button>
            <button 
              className="btn btn-primary" 
              onClick={startGame} 
              disabled={!isHost || startPending} 
              title={startReason}
              style={{ 
                padding: '8px 16px', 
                fontWeight: 600,
                background: (!isHost || !allReady) ? '#6c757d' : '#007bff',
                borderColor: (!isHost || !allReady) ? '#6c757d' : '#007bff'
              }}
            >
              🚀 Start Game
            </button>
            {startMsg ? (
              <span style={{ fontSize: 12, opacity: 0.85, alignSelf: 'center' }}>{startMsg}</span>
            ) : ((!isHost || !allReady) ? (
              <span style={{ fontSize: 12, opacity: 0.85, alignSelf: 'center' }}>{startReason}</span>
            ) : null)}
          </div>
          
          {isHost && (
            <div className="bot-controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <button 
                className="btn btn-ghost" 
                onClick={async () => {
                  setBotError('');
                  try {
                    const bot = await spawnBot(state.id, `Bot ${bots.length + 1}`);
                    setBots((b) => [...b, bot]);
                  } catch (e: any) {
                    setBotError(e?.message || String(e));
                  }
                }}
                style={{ padding: '6px 12px' }}
              >
                🤖 Add Client Bot
              </button>
              <button 
                className="btn btn-ghost" 
                onClick={() => {
                  setBotError('');
                  try {
                    const s = getSocket();
                    s.emit('bot_add', { id: state.id }, (resp: any) => {
                      if (resp && resp.ok === false) setBotError(resp.error || 'Server bot add failed');
                    });
                  } catch (e: any) {
                    setBotError(e?.message || String(e));
                  }
                }}
                style={{ padding: '6px 12px' }}
              >
                🤖 Add Server Bot
              </button>
              {(state.bots || []).length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(state.bots || []).map(bn => (
                    <button
                      key={bn}
                      className="btn btn-ghost"
                      title={`Remove ${bn}`}
                      onClick={() => {
                        const s = getSocket();
                        s.emit('bot_remove', { id: state.id, name: bn }, (resp: any) => {
                          if (resp && resp.ok === false) setBotError(resp.error || 'Remove failed');
                        });
                      }}
                      style={{ padding: '4px 8px', fontSize: 12 }}
                    >
                      🗑 {bn}
                    </button>
                  ))}
                </div>
              )}
              {bots.length > 0 ? (
                <button 
                  className="btn btn-ghost" 
                  onClick={() => { bots.forEach(b => b.stop()); setBots([]); }}
                  style={{ padding: '6px 12px' }}
                >
                  🗑 Remove Client Bots
                </button>
              ) : null}
              {botError ? <div style={{ color: '#e74c3c', fontSize: 12, width: '100%' }}>{botError}</div> : null}
            </div>
          )}
        </div> {/* End of Left Column - lobby-controls */}

        {/* Right Column - Chat Panel */}
        <div className="chat-panel" style={{ height: isMobile ? '400px' : '600px', maxHeight: isMobile ? '50vh' : '600px' }}>
          <div className="chat-header">
            <h3>Lobby Chat</h3>
            <span className="chat-count">{chat.length} messages</span>
          </div>
          <div className="chat-messages" ref={chatMessagesRef}>
          {chat.map((chatMessage, i) => {
            // Parse message format: "username: message" or just "message"
            const colonIndex = chatMessage.message.indexOf(': ');
            const hasUser = colonIndex > 0;
            const username = hasUser ? chatMessage.message.substring(0, colonIndex) : 'System';
            const text = hasUser ? chatMessage.message.substring(colonIndex + 2) : chatMessage.message;
            const currentUserName = sessionStorage.getItem('displayName') || localStorage.getItem('displayName') || '';
            const isCurrentUser = hasUser && username === normalizeName(currentUserName);
            
            return (
              <div 
                key={i} 
                className={`bubble ${isCurrentUser ? 'own' : 'other'} ${!hasUser ? 'system' : ''}`}
              >
                {!isCurrentUser && hasUser && (
                  <div className="bubble-sender">{username}</div>
                )}
                <div className="bubble-content">{text}</div>
                <div className="bubble-time">
                  {chatMessage.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            );
          })}
          {chat.length === 0 && (
            <div className="chat-empty">
              <p>No messages yet. Be the first to say hello! 👋</p>
            </div>
          )}
        </div>
        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && msg.trim()) {
                  sendChat();
                }
              }}
              placeholder="Type a message..."
              className="chat-input"
              maxLength={200}
            />
            <button 
              onClick={sendChat}
              className="chat-send-btn"
              disabled={!msg.trim()}
              title="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
          <div className="chat-input-hint">
            Press Enter to send • {200 - msg.length} chars remaining
          </div>
        </div>
        </div>
        
      </div>
      {/* Color Picker Modal */}
      {colorModalOpen && (
        <div onClick={() => { setColorModalOpen(false); setColorTarget(null); }} style={{ position: 'fixed', inset: 0, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 14, minWidth: 300, boxShadow: 'var(--elev-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Choose Your Color</h3>
              <button className="btn btn-ghost" onClick={() => { setColorModalOpen(false); setColorTarget(null); }} aria-label="Close">✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 24px)', gap: 8 }}>
              {['#EF4444','#F97316','#F59E0B','#10B981','#14B8A6','#06B6D4','#3B82F6','#6366F1','#8B5CF6','#A855F7','#EC4899','#22C55E','#84CC16','#EAB308','#F43F5E','#64748B','#0EA5E9'].map((c) => (
                <button
                  key={c}
                  aria-label={`Set color ${c}`}
                  onClick={() => {
                    const s = getSocket();
                    s.emit('lobby_setting', { id: state.id, setting: 'player_color', value: c, player: colorTarget || undefined });
                    setColorModalOpen(false);
                    setColorTarget(null);
                  }}
                  className="btn btn-ghost"
                  style={{ width: 24, height: 24, padding: 0, borderRadius: 4, background: c, border: (colorTarget && playerColors[colorTarget] === c) ? '2px solid #000' : '1px solid rgba(0,0,0,0.3)' }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
