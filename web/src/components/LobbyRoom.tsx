import { useEffect, useMemo, useState } from 'react';
import { getSocket, rememberLobby } from '../lib/socket';
import type { LobbyInfo } from '../types';
import { spawnBot, type BotHandle } from '../lib/bots';

type Props = {
  lobby: LobbyInfo;
  onGameStarted: () => void;
  onBackToMenu?: () => void;
};

export default function LobbyRoom({ lobby, onGameStarted, onBackToMenu }: Props) {
  const [state, setState] = useState<LobbyInfo>(lobby);
  const [chat, setChat] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [bots, setBots] = useState<BotHandle[]>([]);
  const [botError, setBotError] = useState<string>('');
  const [startMsg, setStartMsg] = useState<string>('');
  const [startPending, setStartPending] = useState<boolean>(false);
  
  // Animation state tracking for player join/leave
  const [prevPlayerNames, setPrevPlayerNames] = useState<Set<string>>(new Set());

  useEffect(() => {
  rememberLobby(state.id);
    const s = getSocket();
    const onLobbyState = (data: any) => {
      if (data?.id === state.id) setState(data);
      if (data?.id === state.id && Array.isArray((data as any).chat)) {
        setChat((data as any).chat.map((c: any) => `${c.from || 'anon'}: ${c.message}`));
      }
    };
    const onChat = (payload: any) => {
      if (payload?.id === state.id && payload?.message) {
        setChat((c) => [...c, `${payload.from || 'anon'}: ${payload.message}`]);
      }
    };
    const onGameState = (payload: any) => {
      if (payload?.lobby_id === state.id) onGameStarted();
    };
    s.on('lobby_state', onLobbyState);
    s.on('lobby_chat', onChat);
    s.on('game_state', onGameState);
    return () => {
      s.off('lobby_state', onLobbyState);
      s.off('lobby_chat', onChat);
      s.off('game_state', onGameState);
    };
  }, [state.id, onGameStarted]);

  // Track player changes for animations
  useEffect(() => {
  const currentPlayerNames = new Set((state.players || []).map(name => name));
  // (Player join/leave animations removed for simplification)
    
    setPrevPlayerNames(currentPlayerNames);
  }, [state.players, prevPlayerNames]);

  function setReady(ready: boolean) {
    const s = getSocket();
    s.emit('lobby_ready', { id: state.id, ready });
  }

  function sendChat() {
    const s = getSocket();
    if (msg.trim()) s.emit('chat_send', { id: state.id, message: msg.trim() });
    setMsg('');
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
  const disconnectRemain = (state as any).disconnect_remain || {} as Record<string, number>;
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
  const players = mergedPlayers;
  const readyCount = hasSidMap
    ? mergedPlayers.filter((p) => p.sid && readySet.has(p.sid!)).length
    : mergedPlayers.filter((p) => readySet.has(p.name)).length;
  const allReady = players.length > 0 && readyCount === players.length;
  const isHost = state.host_sid ? (getSocket().id === state.host_sid) : true;
  const startReason = !isHost ? 'Only host can start' : (!allReady ? 'All players must be ready' : 'Start the game');

  return (
    <div className="lobby-room" style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Vote Kick Banner */}
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
            Time: <strong>{Math.ceil(((state as any).kick_remaining || 0) / 1000)}s</strong>
          </div>
        </div>
      )}
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>Lobby: {state.name}</h2>
        {onBackToMenu && (
          <button 
            className="btn btn-ghost" 
            onClick={onBackToMenu}
            style={{ padding: '6px 12px', fontSize: 14 }}
          >
            ← Back to Menu
          </button>
        )}
      </div>
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
              return (
                <li key={`${p.sid || p.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: isBot ? 0.9 : 1 }}>
                  <span className={`dot ${isReady ? 'ready' : 'not-ready'}`} />
                  <span>{p.name}{isHostRow ? ' (host)' : ''}{isBot ? ' [BOT]' : ''}{remain ? ` (reconnect: ${remain}s)` : ''}</span>
                  <span className={`badge ${isReady ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: 'auto' }}>{isReady ? 'Ready' : 'Not Ready'}</span>
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
              return (
                <li key={`${p.name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: isBot ? 0.9 : 1 }}>
                  <span className={`dot ${isReady ? 'ready' : 'not-ready'}`} />
                  <span>{p.name}{isBot ? ' [BOT]' : ''}{remain ? ` (reconnect: ${remain}s)` : ''}</span>
                  <span className={`badge ${isReady ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: 'auto' }}>{isReady ? 'Ready' : 'Not Ready'}</span>
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
      <div className="chat">
        <div className="log">
          {chat.map((c, i) => (
            <div key={i}>{c}</div>
          ))}
        </div>
        <div className="input">
          <input value={msg} onChange={(e) => setMsg(e.target.value)} />
          <button onClick={sendChat}>Send</button>
        </div>
      </div>
    </div>
  );
}
