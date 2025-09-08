import { useState } from 'react';
import { connectSocket, getSocket, getRemembered, rememberLobby } from '../lib/socket';
import type { LobbyInfo } from '../types';

type Props = {
  onEnterLobby: (lobby: LobbyInfo) => void;
};

export default function MainMenu({ onEnterLobby }: Props) {
  const saved = getRemembered();
  const [name, setName] = useState(saved.displayName || 'Player');
  const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
  const [connected, setConnected] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState('My Game');
  const [pendingJoinId, setPendingJoinId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const lastLobbyId = (saved.lastLobbyId || '').trim();

  async function handleConnect() {
    const s = getSocket();
    setStatus('Connecting…');
    const onConnectError = (err: any) => {
      console.warn('connect_error', err);
      setStatus('Failed to connect to server. Is the backend running on 127.0.0.1:8000?');
    };
    s.once('connect_error', onConnectError);
    try {
  await connectSocket(name);
      s.off('connect_error', onConnectError);
      setConnected(true);
      setStatus('Connected. Loading lobbies…');
      // Register handler before requesting list to avoid race
      s.off('lobby_list');
      s.on('lobby_list', (data: { lobbies: LobbyInfo[] }) => {
        console.debug('lobby_list', data);
        setLobbies(data.lobbies);
        setStatus(data.lobbies.length ? '' : 'No open lobbies. Create one below.');
      });
  s.emit('lobby_list');
      // Start periodic refresh every 10 seconds
      const tick = () => s.emit('lobby_list');
      try { (window as any).__lobbyTick && clearInterval((window as any).__lobbyTick); } catch {}
      ;(window as any).__lobbyTick = setInterval(tick, 10000);
    } catch (e: any) {
      s.off('connect_error', onConnectError);
      setStatus('Failed to connect. Please retry.');
    }
  }

  function createLobby() {
    const s = getSocket();
    setCreating(true);
    s.emit('lobby_create', { name: newLobbyName }, (resp: any) => {
      setCreating(false);
      if (resp?.ok && resp.lobby) {
  try { (window as any).__lobbyId = resp.lobby.id; } catch {}
  onEnterLobby(resp.lobby as LobbyInfo);
      }
    });
  }

  function rejoinLast() {
    if (!lastLobbyId) return;
    const s = getSocket();
    // Explicit join only
    if (!connected) {
      connectSocket(name).then(() => {
        s.emit('auth', { display: name });
        joinLobby(lastLobbyId);
      });
    } else {
      s.emit('auth', { display: name });
      joinLobby(lastLobbyId);
    }
  }

  function joinLobby(id: string) {
    const s = getSocket();
    if (pendingJoinId) return;
    setPendingJoinId(id);
    let timeout: any;
    const onState = (data: any) => {
      if (data?.id === id) {
        cleanup();
  try { (window as any).__lobbyId = (data as any).id; } catch {}
  onEnterLobby(data as LobbyInfo);
      }
    };
    const cleanup = () => {
      setPendingJoinId(null);
      s.off('lobby_state', onState);
      s.off('lobby_joined', onState);
      if (timeout) clearTimeout(timeout);
    };
    s.on('lobby_state', onState);
    s.on('lobby_joined', onState);
    timeout = setTimeout(() => {
      // fallback: refresh list in case join failed silently
      setStatus('Join timed out. Refreshing lobbies…');
      s.emit('lobby_list');
      cleanup();
    }, 4000);
    console.debug('joining lobby', { id });
    setStatus('Joining lobby…');
    s.emit('lobby_join', { id, lobby_id: id }, (resp: any) => {
      console.debug('lobby_join ack', resp);
      if (resp?.ok && resp.lobby) {
        cleanup();
        setStatus('');
  rememberLobby(id);
  try { (window as any).__lobbyId = id; } catch {}
  onEnterLobby(resp.lobby as LobbyInfo);
      } else if (resp && resp.error) {
        setStatus(`Join failed: ${resp.error}`);
        cleanup();
      }
    });
  }

  return (
  <div className="main-menu" style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1>Monopoly Online</h1>
      {!connected ? (
        <div className="connect">
          <label>
            Display name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleConnect}>Connect</button>
            {lastLobbyId ? <button onClick={rejoinLast} title={`Rejoin lobby ${lastLobbyId}`}>Rejoin Last Game</button> : null}
          </div>
        </div>
      ) : (
        <div className="lobbies">
          {status ? <div style={{ fontSize: 12, opacity: 0.8 }}>{status}</div> : null}
          {lastLobbyId ? (
            <div className="rejoin" style={{ margin: '6px 0 10px' }}>
              <button onClick={rejoinLast}>Rejoin Last Game</button>
            </div>
          ) : null}
          <div className="create">
            <input value={newLobbyName} onChange={(e) => setNewLobbyName(e.target.value)} />
            <button onClick={createLobby} disabled={creating}>Create Lobby</button>
          </div>
          <h3>Available Lobbies</h3>
          <ul>
            {lobbies.map((l) => (
              <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge">{(l.players || []).length} in lobby</span>
                <span>{l.name}</span>
                <button onClick={() => joinLobby(l.id)} disabled={pendingJoinId === l.id} style={{ marginLeft: 'auto' }}>
                  {pendingJoinId === l.id ? 'Joining…' : 'Join'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
