import { useEffect, useMemo, useState } from 'react';
import { getSocket, rememberLobby } from '../lib/socket';
import type { LobbyInfo } from '../types';
import { spawnBot, type BotHandle } from '../lib/bots';

type Props = {
  lobby: LobbyInfo;
  onGameStarted: () => void;
};

export default function LobbyRoom({ lobby, onGameStarted }: Props) {
  const [state, setState] = useState<LobbyInfo>(lobby);
  const [chat, setChat] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [bots, setBots] = useState<BotHandle[]>([]);
  const [botError, setBotError] = useState<string>('');
  const [startMsg, setStartMsg] = useState<string>('');
  const [startPending, setStartPending] = useState<boolean>(false);

  useEffect(() => {
  rememberLobby(state.id);
    const s = getSocket();
    const onLobbyState = (data: any) => {
      if (data?.id === state.id) setState(data);
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
  const hasSidMap = Object.keys(sidToName).length > 0;
  type PlayerRow = { sid?: string; name: string };
  const playersBySid: PlayerRow[] = hasSidMap ? Object.entries(sidToName).map(([sid, name]) => ({ sid, name })) : [];
  const playersByName: PlayerRow[] = !hasSidMap ? (state.players || []).map((name) => ({ name })) : [];
  // Merge in any names not present in sid map (e.g., server bots or disconnected players)
  const mergedPlayers: PlayerRow[] = useMemo(() => {
    if (!hasSidMap) return playersByName;
    const byName = new Set(playersBySid.map(p => p.name));
    const extras: PlayerRow[] = (state.players || []).filter(n => !byName.has(n)).map(name => ({ name }));
    return [...playersBySid, ...extras];
  }, [hasSidMap, playersBySid, playersByName, state.players]);
  const botSet = useMemo(() => new Set(state.bots || []), [state.bots]);
  const readySet = useMemo(() => new Set(state.ready || []), [state.ready]);
  const players = hasSidMap ? playersBySid : playersByName;
  const readyCount = hasSidMap
    ? playersBySid.filter((p) => p.sid && readySet.has(p.sid)).length
    : playersByName.filter((p) => readySet.has(p.name)).length;
  const allReady = players.length > 0 && readyCount === players.length;
  const isHost = state.host_sid ? (getSocket().id === state.host_sid) : true;
  const startReason = !isHost ? 'Only host can start' : (!allReady ? 'All players must be ready' : 'Start the game');

  return (
    <div className="lobby-room">
      <h2>Lobby: {state.name}</h2>
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
              return (
                <li key={`${p.sid || p.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: isBot ? 0.9 : 1 }}>
                  <span className={`dot ${isReady ? 'ready' : 'not-ready'}`} />
                  <span>{p.name}{isHostRow ? ' (host)' : ''}{isBot ? ' [BOT]' : ''}</span>
                  <span className={`badge ${isReady ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: 'auto' }}>{isReady ? 'Ready' : 'Not Ready'}</span>
                </li>
              );
            })
          ) : (
            playersByName.map((p, idx) => {
              const isReady = readySet.has(p.name);
              const isBot = botSet.has(p.name);
              return (
                <li key={`${p.name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: isBot ? 0.9 : 1 }}>
                  <span className={`dot ${isReady ? 'ready' : 'not-ready'}`} />
                  <span>{p.name}{isBot ? ' [BOT]' : ''}</span>
                  <span className={`badge ${isReady ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: 'auto' }}>{isReady ? 'Ready' : 'Not Ready'}</span>
                </li>
              );
            })
          )}
        </ul>
      </div>
      <div className="controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-success" onClick={() => setReady(true)}>I’m Ready</button>
        <button className="btn btn-warning" onClick={() => setReady(false)}>Unready</button>
        <button className="btn btn-primary" onClick={startGame} disabled={!isHost || startPending} title={startReason}>Start Game</button>
  {startMsg ? <span style={{ fontSize: 12, opacity: 0.85 }}>{startMsg}</span> : ((!isHost || !allReady) ? <span style={{ fontSize: 12, opacity: 0.85 }}>{startReason}</span> : null)}
  <button className="btn btn-ghost" onClick={async () => {
          setBotError('');
          try {
            const bot = await spawnBot(state.id, `Bot ${bots.length + 1}`);
            setBots((b) => [...b, bot]);
          } catch (e: any) {
            setBotError(e?.message || String(e));
          }
  }}>Add Bot</button>
  <button className="btn btn-ghost" onClick={() => {
          setBotError('');
          try {
            const s = getSocket();
            s.emit('bot_add', { id: state.id }, (resp: any) => {
              if (resp && resp.ok === false) setBotError(resp.error || 'Server bot add failed');
            });
          } catch (e: any) {
            setBotError(e?.message || String(e));
          }
  }}>Add Server Bot</button>
  {bots.length > 0 ? <button className="btn btn-ghost" onClick={() => { bots.forEach(b => b.stop()); setBots([]); }}>Remove Bots</button> : null}
        {botError ? <div style={{ color: '#e74c3c', fontSize: 12, width: '100%' }}>{botError}</div> : null}
      </div>
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
