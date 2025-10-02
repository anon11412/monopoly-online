import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { connectSocket, getSocket, getRemembered, rememberLobby, getOrCreateDisplayName, getResolvedSocketConfig } from '../lib/socket';
import { useTheme } from '../lib/theme';
import AudioSettings from './AudioSettings';
import AccessibilitySettings from './AccessibilitySettings';
import { AuthPage } from './AuthPage';
import { ProfilePage } from './ProfilePage';
import type { LobbyInfo } from '../types';
import { getStreetRent, houseCostForGroup, mortgageValue } from '../lib/rentData';

type Props = {
  onEnterLobby: (lobby: LobbyInfo) => void;
};

export default function MainMenu({ onEnterLobby }: Props) {
  const saved = getRemembered();
  const sanitize = (n: string) => {
    const s = (n || '').trim();
    if (!s) return '';
    if (/^player$/i.test(s)) return '';
    return s;
  };
  
  // Get auth state first
  const { theme, toggleTheme } = useTheme();
  const { user, ready: authReady, googleReady, signOut, signInWithGoogle, loadRecents } = useAuth();
  const [recentAccounts, setRecentAccounts] = useState<Array<any>>([]);
  // Load recent accounts whenever auth becomes ready
  useEffect(() => {
    if (authReady) {
      setRecentAccounts(loadRecents());
    }
  }, [authReady, user]);

  const handleQuickAccount = async (acct: any) => {
    if (!acct) return;
    // For local accounts we still need password; we can't store that. Show hint.
    // If provider is google, trigger google sign-in flow.
    if (acct.provider === 'google') {
      try { await handleGoogleSignIn(); } catch {}
      return;
    }
    // For local accounts offer prefill path: open auth page with login mode & prefill username
    setAuthMode('login');
    setCurrentPage('auth');
    // We can't autofill password but we can stash a stub to show.
    setAuthStub(`Enter password for @${acct.id.split(':')[1]}`);
  };

  const recentAccountsPanel = (
    <div style={{ marginTop: 16 }}>
      {recentAccounts.length > 0 && (
        <div className="ui-labelframe" style={{ padding: 12 }}>
          <div className="ui-title" style={{ marginBottom: 8 }}>Recent Accounts</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {recentAccounts.map(r => (
              <button
                key={r.id}
                onClick={() => handleQuickAccount(r)}
                className="btn btn-ghost"
                style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', fontSize:12 }}
                title={r.provider === 'google' ? 'Google account' : 'Local account'}
              >
                <span style={{
                  width:24,height:24,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                  background:'var(--color-surface-alt)',fontSize:14
                }}>{(r.name||'?').slice(0,1).toUpperCase()}</span>
                <span style={{ maxWidth:120, overflow:'hidden', textOverflow:'ellipsis' }}>{r.name}</span>
                {r.provider === 'google' && <span style={{ fontSize:10, opacity:0.6 }}>G</span>}
              </button>
            ))}
          </div>
          <div className="ui-xs" style={{ opacity:0.6, marginTop:6 }}>Google accounts sign in instantly. Local accounts need password.</div>
        </div>
      )}
    </div>
  );
  
  const [name, setName] = useState(() => {
    // Use lazy initial state to call getDisplayName after user is available
    if (user?.name) return user.name;
    return sanitize(saved.displayName || '') || getOrCreateDisplayName();
  });
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
  const [authStub, setAuthStub] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [currentPage, setCurrentPage] = useState<'menu' | 'auth' | 'profile'>('menu');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  const handleGoogleSignIn = async () => {
    if (!googleReady || isSigningIn) return;
    
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
      setAuthStub(null);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      setAuthStub(`Sign-in failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSigningIn(false);
    }
  };
  
  const handleLoginLocal = () => {
    setCurrentPage('auth');
    setAuthMode('login');
  };
  
  const handleRegisterLocal = () => {
    setCurrentPage('auth');
    setAuthMode('register');
  };
  
  const handleBackToMenu = () => {
            {/* Recent Accounts */}
            {!user && recentAccountsPanel}
    setCurrentPage('menu');
    setAuthStub(null);
  };
  
  const handleShowProfile = () => {
    setCurrentPage('profile');
  };
  

  const [showTradeDemo, setShowTradeDemo] = useState(false);
  const tradeDemoRef = useRef<HTMLDivElement | null>(null);
  const [friends, setFriends] = useState<{ accepted: any[]; pending_in: any[]; pending_out: any[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadFriends() {
      try {
        if (!authReady || !user) { setFriends(null); return; }
        const res = await fetch('/friends', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFriends({
          accepted: data.accepted || [],
          pending_in: data.pending_in || [],
          pending_out: data.pending_out || [],
        });
      } catch {}
    }
    loadFriends();
    const t = setInterval(loadFriends, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [authReady, user]);

  // Update display name when user auth state changes
  useEffect(() => {
    const newName = user?.name || sanitize(saved.displayName || '') || getOrCreateDisplayName();
    if (newName !== name) {
      setName(newName);
    }
  }, [user?.name]);

  // Preserve last lobby for resume: do not auto-leave on landing
  // This allows the user to rejoin within the server's disconnect grace period.
  useEffect(() => {
    // no-op: keep lastLobbyId so Resume buttons are shown
  }, []);

  async function handleConnect() {
    const s = getSocket();
    console.debug('[MainMenu] handleConnect start', { already: s.connected });
    setStatus('Connecting…');
    // Fallback status update if still not connected after 3s
    setTimeout(() => {
      if (!getSocket().connected) {
        setStatus(prev => prev.startsWith('Failed') ? prev : 'Still connecting… If this hangs, make sure backend is running (default http://127.0.0.1:8000)');
      }
    }, 3000);
    try {
      await connectSocket(name);
      console.debug('[MainMenu] connect resolved');
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
      console.warn('[MainMenu] connect failed', e);
      setStatus('Failed to connect. Please ensure backend is running and retry.');
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
    <div style={{ position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      {authReady && (
        user ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
            {user.avatar ? <img src={user.avatar} alt={user.name} style={{ width: 20, height: 20, borderRadius: '50%' }} /> : <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#888', display: 'inline-block' }} />}
            <span className="ui-sm" style={{ opacity: 0.9, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
            {Array.isArray(user.achievements) && user.achievements.includes('early_adopter') && (
              <span className="badge badge-info" title="Early Adopter" style={{ fontSize: 10 }}>🎖 Early</span>
            )}
            <button className="btn btn-ghost" onClick={handleShowProfile} title="Profile" style={{ padding: '2px 6px' }}>Profile</button>
            <button className="btn btn-ghost" onClick={signOut} title="Sign out" style={{ padding: '2px 6px' }}>Sign out</button>
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {googleReady && (
              <button 
                className={`btn ${isSigningIn ? 'btn-loading' : 'btn-primary'}`}
                onClick={handleGoogleSignIn} 
                disabled={isSigningIn}
                title="Sign in with Google"
              >
                {isSigningIn ? 'Signing in...' : '🔍 Google'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleLoginLocal} title="Local log in">Log In</button>
            <button className="btn btn-ghost" onClick={handleRegisterLocal} title="Local sign up">Sign Up</button>
          </div>
        )
      )}
      {lastLobbyId && connected && <button className="btn btn-ghost" onClick={rejoinLast} title="Rejoin last game">↺</button>}
      <button className="btn btn-ghost" onClick={() => setShowAccessibilitySettings(!showAccessibilitySettings)} title="Accessibility Settings" aria-label="Accessibility Settings">♿</button>
      <button className="btn btn-ghost" onClick={() => setShowAudioSettings(!showAudioSettings)} title="Audio Settings" aria-label="Audio Settings">🔊</button>
      <button className="btn btn-ghost" onClick={toggleTheme} title="Toggle Theme" aria-label="Toggle Theme">{theme === 'light' ? '🌙' : '☀️'}</button>
    </div>
  );

  const mainMenuContent = (
    <>
      <div className="main-menu" style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 80 }}>
        {stickyBar}
      {authStub && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.45)' }} onClick={() => setAuthStub(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{ background: 'var(--surface, #1f2937)', color: 'inherit', padding: 16, borderRadius: 10, minWidth: 280, maxWidth: '90vw', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
            <div className="ui-title ui-h4" style={{ marginBottom: 8 }}>Feature coming soon</div>
            <div className="ui-sm" style={{ opacity: 0.85, marginBottom: 12 }}>{authStub}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setAuthStub(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
      {/* Hero Section */}
      <section style={{ minHeight: '55vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 24, padding: '40px 20px' }}>
        <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.6rem)', margin: 0, lineHeight: 1.1 }}>InvestUp.trade — Strategic Monopoly Online</h1>
        <p style={{ maxWidth: 720, fontSize: 'clamp(1rem, 2.2vw, 1.25rem)', lineHeight: 1.4, opacity: 0.9 }}>
          Trade dynamically, invest in rival players, automate routine moves, and outmaneuver opponents through cash flow strategy, rentals, and stock-backed influence.
        </p>
        <div className="ui-sm" style={{ opacity: 0.75 }}>
          Play a modern Monopoly alternative with online multiplayer and a player stock market.
        </div>
        {!connected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" style={{ padding: '10px 14px', fontSize: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', minWidth: 220 }} />
              <button onClick={handleConnect} className="btn" style={{ padding: '14px 34px', fontSize: 18, fontWeight: 700, borderRadius: 10, background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 8px 24px -6px rgba(16,185,129,0.45)' }}>Connect & Play</button>
              {lastLobbyId ? <button onClick={rejoinLast} className="btn btn-ghost" style={{ padding: '14px 24px', fontSize: 16 }}>Rejoin Last</button> : null}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{status || 'Enter a display name to begin.'}</div>
            <div style={{ fontSize: 11, opacity: 0.45 }}>
              Backend: {(() => { const c = getResolvedSocketConfig(); return c.base || '(same-origin)'; })()} path {getResolvedSocketConfig().path}
            </div>
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

      {/* Friends (stub) */}
      {authReady && user && (
        <section style={{ padding: '20px', display: 'grid', gap: 10 }}>
          <div className="ui-title ui-h3">Friends (preview)</div>
          {friends ? (
            <div className="ui-sm" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>Accepted: {friends.accepted.length}</span>
              <span>Pending In: {friends.pending_in.length}</span>
              <span>Pending Out: {friends.pending_out.length}</span>
            </div>
          ) : (
            <div className="ui-sm" style={{ opacity: 0.7 }}>Sign in to see friends. UI coming soon.</div>
          )}
        </section>
      )}

      {/* Informational Section (classic style) */}
      <section style={{ padding: '40px 20px', display: 'grid', gap: 40 }}>
        <div style={{ maxWidth: 840, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', margin: '0 0 10px' }}>Own, Invest, Automate, Dominate</h2>
          <p style={{ fontSize: 16, lineHeight: 1.5, opacity: 0.85 }}>
            Learn the basics and master the advanced systems. These cards summarize the core flow and the powerful features we’ve added.
          </p>
        </div>
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
          {/* Left: Basic Rules */}
          <div>
            <div className="ui-title ui-h3" style={{ marginBottom: 8 }}>Basic Rules</div>
            <div style={{ display: 'grid', gap: 16 }}>
              {[
                {
                  icon: '🏠',
                  title: 'Buy & Trade Properties',
                  what: 'Own tiles to collect rent. Trade to complete sets sooner.',
                  why: 'Completing a set unlocks higher rent and building power.'
                },
                {
                  icon: '🏗️',
                  title: 'Build Houses & Hotels',
                  what: 'Build evenly across a set; 4 houses upgrade to a hotel.',
                  why: 'Each build multiplies rent and accelerates income growth.'
                },
                {
                  icon: '🛡️',
                  title: 'Avoid Bankruptcy',
                  what: 'Keep cash ready. Mortgage low‑impact tiles before selling houses.',
                  why: 'Staying liquid prevents forced sales and keeps control of your plan.'
                },
              ].map((f) => (
                <div key={f.title} style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))', border: '1px solid rgba(255,255,255,0.08)', padding: '18px 16px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 28 }}>{f.icon}</div>
                  <div className="ui-title" style={{ fontSize: 15 }}>{f.title}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>{f.what}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.4, opacity: 0.8 }}><span style={{ opacity: 0.85, fontWeight: 600 }}>Why it helps:</span> {f.why}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Advanced Features */}
          <div>
            <div className="ui-title ui-h3" style={{ marginBottom: 8 }}>Advanced Features</div>
            <div style={{ display: 'grid', gap: 16 }}>
              {[
                {
                  icon: '💸',
                  title: 'Per‑Turn Payments',
                  what: 'Add automatic payments to trades (e.g., $50 × 10 turns).',
                  why: 'Close deals without big upfront cash and smooth your cash flow.'
                },
                {
                  icon: '🤖',
                  title: 'Auto‑Roll & Automation',
                  what: 'Auto‑roll, auto‑buy, auto end‑turn; auto‑mortgage/unmortgage when needed.',
                  why: 'Speeds up play with fewer clicks and handles routine money crunches automatically.'
                },
                {
                  icon: '📈',
                  title: 'Player Stocks',
                  what: 'Buy shares in players to own a percentage of their cash value.',
                  why: 'Example: invest $50 when a player has $50 → you own 50%. If their cash grows to $1,000, your stake is worth $500 — sell to realize $500.'
                },
              ].map((f) => (
                <div key={f.title} style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))', border: '1px solid rgba(255,255,255,0.08)', padding: '18px 16px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 28 }}>{f.icon}</div>
                  <div className="ui-title" style={{ fontSize: 15 }}>{f.title}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>{f.what}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.4, opacity: 0.8 }}><span style={{ opacity: 0.85, fontWeight: 600 }}>Why it helps:</span> {f.why}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Interactive Demos */}
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="ui-title ui-h3">Interactive Demos</div>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
            <PropertyDemoCard />
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, background: 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="ui-title" style={{ fontSize: 15 }}>Advanced Trade (Demo)</div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                Explore the advanced trade builder without joining a lobby.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!showTradeDemo ? (
                  <button
                    className="btn"
                    onClick={() => {
                      setShowTradeDemo(true);
                      setTimeout(() => {
                        try { tradeDemoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
                      }, 0);
                    }}
                  >Open Demo</button>
                ) : (
                  <button className="btn btn-ghost" onClick={() => setShowTradeDemo(false)}>Close Demo</button>
                )}
              </div>
              <div className="ui-sm" style={{ opacity: 0.75 }}>Safe preview — does not send to server.</div>
              <div ref={tradeDemoRef} />
              {showTradeDemo && (
                <div style={{ marginTop: 12 }}>
                  <TradeDemoInline />
                </div>
              )}
            </div>
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
    </>
  );

  // Handle page routing
  if (currentPage === 'auth') {
    return (
      <AuthPage
        mode={authMode}
        onBack={handleBackToMenu}
        onSwitchMode={setAuthMode}
      />
    );
  }

  if (currentPage === 'profile') {
    return (
      <ProfilePage
        onBack={handleBackToMenu}
      />
    );
  }

  // Default: render main menu
  return mainMenuContent;
}

// --- Local Demo Components ---

function PropertyDemoCard() {
  // Demo tile: Paris (yellow, price $280)
  const name = 'Paris';
  const price = 280;
  const group = 'yellow';
  const color = '#FFFF00';
  const rent = getStreetRent(name);
  const houseCost = houseCostForGroup(group);
  const mortVal = mortgageValue(price);
  const unmortPay = mortVal + Math.ceil(mortVal * 0.1);

  const [owner, setOwner] = useState<'Bank' | 'You' | 'Rival'>('Bank');
  const [fullSet, setFullSet] = useState<boolean>(false);
  const [houses, setHouses] = useState<number>(0);
  const [hotel, setHotel] = useState<boolean>(false);
  const [mortgaged, setMortgaged] = useState<boolean>(false);

  function currentRent(): number {
    if (mortgaged || !rent) return 0;
    if (hotel) return rent.hotel;
    if (houses === 4) return rent.house4;
    if (houses === 3) return rent.house3;
    if (houses === 2) return rent.house2;
    if (houses === 1) return rent.house1;
    return fullSet ? rent.withSet : rent.base;
  }

  const canBuild = owner === 'You' && !mortgaged && !hotel && houses < 4;
  const canAddHotel = owner === 'You' && !mortgaged && !hotel && houses === 4;
  const canSellHouse = owner === 'You' && (hotel || houses > 0);
  const canMortgage = owner === 'You' && !mortgaged && !hotel && houses === 0;
  const canUnmortgage = owner === 'You' && mortgaged;

  function buy() {
    setOwner('You');
  }
  function build() {
    if (canBuild) setHouses(h => Math.min(4, h + 1));
  }
  function addHotel() {
    if (canAddHotel) { setHotel(true); setHouses(0); }
  }
  function sellBuilding() {
    if (hotel) { setHotel(false); setHouses(4); return; }
    if (houses > 0) setHouses(h => Math.max(0, h - 1));
  }
  function mortgage() {
    if (canMortgage) setMortgaged(true);
  }
  function unmortgage() {
    if (canUnmortgage) setMortgaged(false);
  }
  function resetAll() {
    setOwner('Bank'); setFullSet(false); setHouses(0); setHotel(false); setMortgaged(false);
  }

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, background: 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="ui-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 14, height: 14, background: color, border: '1px solid rgba(0,0,0,0.2)', borderRadius: 3 }} />
        {name}
      </div>
      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Price: ${price}</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>House cost: ${houseCost}</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Mortgage: ${mortVal}</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Unmortgage: ${unmortPay}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12 }}>Owner
          <select value={owner} onChange={(e) => setOwner(e.target.value as any)} style={{ marginLeft: 6 }}>
            <option>Bank</option>
            <option>You</option>
            <option>Rival</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={fullSet} onChange={(e) => setFullSet(e.target.checked)} disabled={houses>0 || hotel} /> own full set (no houses)
        </label>
        <span className="badge">{mortgaged ? 'Mortgaged' : 'Active'}</span>
      </div>
      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
        <div style={{ fontSize: 13 }}>Houses: {hotel ? 'Hotel' : houses}</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Rent now: ${currentRent()}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {owner === 'Bank' && <button className="btn" onClick={buy}>Buy for ${price}</button>}
        {owner !== 'Bank' && <button className="btn btn-ghost" onClick={resetAll}>Reset</button>}
        <button className="btn" onClick={build} disabled={!canBuild}>Build House (+${houseCost})</button>
        <button className="btn" onClick={addHotel} disabled={!canAddHotel}>Add Hotel (+${houseCost})</button>
        <button className="btn btn-ghost" onClick={sellBuilding} disabled={!canSellHouse}>{hotel ? 'Sell Hotel' : 'Sell House'} (+${Math.floor(houseCost/2)})</button>
        {!mortgaged ? (
          <button className="btn btn-ghost" onClick={mortgage} disabled={!canMortgage}>Mortgage (+${mortVal})</button>
        ) : (
          <button className="btn" onClick={unmortgage} disabled={!canUnmortgage}>Unmortgage (−${unmortPay})</button>
        )}
      </div>
      <div className="ui-sm" style={{ opacity: 0.75 }}>
        Demo only — mirrors in‑game logic: build evenly, no rent when mortgaged, hotel after 4 houses.
      </div>
    </div>
  );
}

function TradeDemoInline() {
  const [give, setGive] = useState(0);
  const [receive, setReceive] = useState(0);
  const [payments, setPayments] = useState<Array<{ who: 'me'|'them'; amount: number; turns: number }>>([]);
  function addPayment() { setPayments(p => [...p, { who: 'me', amount: 50, turns: 10 }]); }
  function update(i: number, patch: Partial<{ who: 'me'|'them'; amount: number; turns: number }>) { setPayments(p => p.map((row, idx) => idx === i ? { ...row, ...patch } : row)); }
  function remove(i: number) { setPayments(p => p.filter((_, idx) => idx !== i)); }
  return (
    <div className="ui-labelframe" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div className="ui-title">Your Offer</div>
          <label style={{ fontSize: 12 }}>Cash
            <input type="number" min={0} value={give} onChange={(e) => setGive(parseInt(e.target.value||'0',10))} style={{ width: 120, marginLeft: 6 }} />
          </label>
        </div>
        <div>
          <div className="ui-title">Partner Offer</div>
          <label style={{ fontSize: 12 }}>Cash
            <input type="number" min={0} value={receive} onChange={(e) => setReceive(parseInt(e.target.value||'0',10))} style={{ width: 120, marginLeft: 6 }} />
          </label>
        </div>
      </div>
      <div>
        <div className="ui-title">Per‑Turn Payments</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {payments.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={p.who} onChange={(e) => update(i, { who: e.target.value as any })}>
                <option value="me">Me pay</option>
                <option value="them">Partner pay</option>
              </select>
              <label style={{ fontSize: 12 }}>amount
                <input type="number" min={1} value={p.amount} onChange={(e) => update(i, { amount: parseInt(e.target.value||'0',10) })} style={{ width: 100, marginLeft: 6 }} />
              </label>
              <label style={{ fontSize: 12 }}>turns
                <input type="number" min={1} value={p.turns} onChange={(e) => update(i, { turns: parseInt(e.target.value||'0',10) })} style={{ width: 100, marginLeft: 6 }} />
              </label>
              <button className="btn btn-ghost" onClick={() => remove(i)}>🗑️</button>
            </div>
          ))}
          <button className="btn" onClick={addPayment}>➕ Add payment</button>
        </div>
      </div>
      <div className="ui-sm" style={{ opacity: 0.75 }}>
        Demo only — in a lobby, the Advanced Trade panel can also bundle properties and rental rights.
      </div>
    </div>
  );
}
