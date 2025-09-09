import { useState, useEffect } from 'react';
import { connectSocket, getSocket, getRemembered, rememberLobby } from '../lib/socket';
import { useTheme } from '../lib/theme';
import AudioSettings from './AudioSettings';
import AccessibilitySettings from './AccessibilitySettings';
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
  const [refreshCountdown, setRefreshCountdown] = useState(10);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);
  const lastLobbyId = (saved.lastLobbyId || '').trim();
  const { theme, toggleTheme } = useTheme();

  // Auto-leave remembered lobby on landing (prevents ghost membership lingering on server)
  useEffect(() => {
    if (lastLobbyId) {
      try {
        const s = getSocket();
        s.emit('leave_lobby', { id: lastLobbyId });
        rememberLobby('');
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const filtered = (data.lobbies || []).filter(l => (l.players || []).length > 0);
        setLobbies(filtered);
        setStatus(filtered.length ? '' : 'No open lobbies. Create one below.');
      });
      s.off('lobby_state');
      s.on('lobby_state', () => { s.emit('lobby_list'); });
      // Real-time lobby lifecycle events (creation / deletion)
      s.off('lobby_created');
      s.off('lobby_deleted');
      s.on('lobby_created', (payload: any) => {
        const lb: LobbyInfo | undefined = payload?.lobby;
        if (!lb) return;
        // Visibility rules: lobby must have ≥1 player and no active game ref
        if ((lb.players || []).length === 0 || (lb as any).game) return;
        setLobbies(prev => {
          if (prev.some(l => l.id === lb.id)) return prev.map(l => l.id === lb.id ? lb : l);
          return [...prev, lb];
        });
      });
      s.on('lobby_deleted', (payload: any) => {
        const id = payload?.id; if (!id) return;
        setLobbies(prev => prev.filter(l => l.id !== id));
      });
      s.emit('lobby_list');
      // Start periodic refresh every 9 seconds with countdown
      const tick = () => {
        s.emit('lobby_list');
        setRefreshCountdown(9);
      };
      const countdown = () => {
        setRefreshCountdown(prev => prev > 0 ? prev - 1 : 9);
      };
      try { 
        (window as any).__lobbyTick && clearInterval((window as any).__lobbyTick);
        (window as any).__lobbyCountdown && clearInterval((window as any).__lobbyCountdown);
      } catch {}
      ;(window as any).__lobbyTick = setInterval(tick, 9000);
      ;(window as any).__lobbyCountdown = setInterval(countdown, 1000);
    } catch (e: any) {
      s.off('connect_error', onConnectError);
      setStatus('Failed to connect. Please retry.');
    }
  }

  function manualRefresh() {
    const s = getSocket();
    s.emit('lobby_list');
    setRefreshCountdown(9);
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

  // Sticky connect bar (persistent CTA)
  const stickyBar = (
    <div style={{ position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.4)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <strong style={{ letterSpacing: 0.5 }}>Monopoly Online</strong>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input aria-label="Display Name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'inherit', width: 140, fontSize: 12 }} />
        {!connected ? (
          <button className="btn" onClick={handleConnect} style={{ fontWeight: 600 }}>Connect</button>
        ) : (
          <button className="btn" onClick={manualRefresh} style={{ fontWeight: 600 }}>Refresh</button>
        )}
        {lastLobbyId && connected && <button className="btn btn-ghost" onClick={rejoinLast} title="Rejoin last game">↺</button>}
        <button className="btn btn-ghost" onClick={() => setShowAccessibilitySettings(!showAccessibilitySettings)} title="Accessibility Settings" aria-label="Accessibility Settings">♿</button>
        <button className="btn btn-ghost" onClick={() => setShowAudioSettings(!showAudioSettings)} title="Audio Settings" aria-label="Audio Settings">🔊</button>
        <button className="btn btn-ghost" onClick={toggleTheme} title="Toggle Theme" aria-label="Toggle Theme">{theme === 'light' ? '🌙' : '☀️'}</button>
      </div>
    </div>
  );

  return (
    <div className="main-menu" style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 80 }}>
      {stickyBar}
      {/* Hero Section */}
      <section style={{ minHeight: '55vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 24, padding: '40px 20px' }}>
        <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.6rem)', margin: 0, lineHeight: 1.1 }}>Strategic Monopoly Reimagined</h1>
        <p style={{ maxWidth: 720, fontSize: 'clamp(1rem, 2.2vw, 1.25rem)', lineHeight: 1.4, opacity: 0.9 }}>
          Trade dynamically, invest in rival players, automate routine moves, and outmaneuver opponents through cash flow strategy, rentals, and stock-backed influence.
        </p>
        {!connected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" style={{ padding: '10px 14px', fontSize: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', minWidth: 220 }} />
              <button onClick={handleConnect} className="btn" style={{ padding: '14px 34px', fontSize: 18, fontWeight: 700, borderRadius: 10, background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 8px 24px -6px rgba(16,185,129,0.45)' }}>Connect & Play</button>
              {lastLobbyId ? <button onClick={rejoinLast} className="btn btn-ghost" style={{ padding: '14px 24px', fontSize: 16 }}>Rejoin Last</button> : null}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{status || 'Enter a display name to begin.'}</div>
          </div>
        )}
        {connected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
                <input value={newLobbyName} onChange={(e) => setNewLobbyName(e.target.value)} placeholder="New lobby name" style={{ padding: '12px 14px', fontSize: 15, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)' }} />
                <button onClick={createLobby} disabled={creating} className="btn" style={{ padding: '12px 20px', fontWeight: 600 }}>{creating ? 'Creating…' : 'Create Lobby'}</button>
              </div>
              <div style={{ minWidth: 300, maxWidth: 520 }}>
                <h3 style={{ margin: '4px 0 8px' }}>Available Lobbies</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <button onClick={manualRefresh} className="btn btn-ghost">🔄</button>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Auto in {refreshCountdown}s</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {lobbies.map((l) => (
                    <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.18s' }} onClick={() => joinLobby(l.id)} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}>
                      <span className="badge">{(l.players || []).length}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                      <button onClick={(e) => { e.stopPropagation(); joinLobby(l.id); }} disabled={pendingJoinId === l.id} className="btn btn-ghost" style={{ padding: '4px 10px' }}>{pendingJoinId === l.id ? '…' : 'Join'}</button>
                    </li>
                  ))}
                  {lobbies.length === 0 && <li style={{ fontSize: 12, opacity: 0.65 }}>No open lobbies. Create one above.</li>}
                </ul>
              </div>
            </div>
            {lastLobbyId && <button onClick={rejoinLast} className="btn btn-ghost" style={{ fontSize: 14 }}>Rejoin Last Game</button>}
            <div style={{ fontSize: 12, opacity: 0.7 }}>{status}</div>
          </div>
        )}
      </section>

      {/* Informational Section */}
      <section style={{ padding: '40px 20px', display: 'grid', gap: 40 }}>
        <div style={{ maxWidth: 840, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', margin: '0 0 10px' }}>Own, Invest, Automate, Dominate</h2>
          <p style={{ fontSize: 16, lineHeight: 1.5, opacity: 0.85 }}>
            Build wealth not just through properties—deploy recurring payments, rental agreements, and cross-player stock stakes. Strategic liquidity and automation set elite players apart.
          </p>
        </div>
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          {[
            { icon: '📈', title: 'Player Stocks', text: 'Invest directly in other players—ride their momentum or diversify your influence.' },
            { icon: '🤖', title: 'Auto Actions', text: 'Automate rolls, buys, and housing with smart thresholds to accelerate pacing.' },
            { icon: '🔄', title: 'Advanced Trading', text: 'Bundle properties, cash, functions and more in multi-asset negotiations.' },
            { icon: '💼', title: 'Recurring Deals', text: 'Set per-turn payments or rental flows for long-term leverage.' },
            { icon: '🛠️', title: 'Dynamic Functions', text: 'Trigger rule-based interactions: rental agreements, stake adjustments, and more.' },
            { icon: '🎨', title: 'Adaptive UI', text: 'Responsive, accessible interface with dark mode and reduced motion support.' },
          ].map((f) => (
            <div key={f.title} style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))', border: '1px solid rgba(255,255,255,0.08)', padding: '18px 16px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden' }}>
              <div style={{ fontSize: 28 }}>{f.icon}</div>
              <strong style={{ fontSize: 15 }}>{f.title}</strong>
              <div style={{ fontSize: 13, lineHeight: 1.4, opacity: 0.85 }}>{f.text}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 30, maxWidth: 1000, margin: '10px auto 0' }}>
          <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            {[
              { label: 'Board Layout', alt: 'Board screenshot placeholder' },
              { label: 'Stocks Panel', alt: 'Stocks UI placeholder' },
              { label: 'Auto Actions', alt: 'Automation settings placeholder' },
            ].map(img => (
              <div key={img.label} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, background: 'rgba(0,0,0,0.3)', minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                <div style={{ width: '100%', flex: 1, background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 8px, transparent 8px 16px)', borderRadius: 8 }} />
                <span style={{ fontSize: 13, opacity: 0.75 }}>{img.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Settings Modals Inline */}
      {showAccessibilitySettings && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface, #1f2937)', padding: 20, borderRadius: 12, width: 'min(520px,90vw)', maxHeight: '80vh', overflowY: 'auto' }}>
            <AccessibilitySettings compact={false} onClose={() => setShowAccessibilitySettings(false)} />
          </div>
        </div>
      )}
      {showAudioSettings && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface, #1f2937)', padding: 20, borderRadius: 12, width: 'min(480px,90vw)', maxHeight: '80vh', overflowY: 'auto' }}>
            <AudioSettings compact={false} onClose={() => setShowAudioSettings(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
