import { useEffect, useRef, useState } from 'react';
import MainMenu from './components/MainMenu';
import LobbyRoom from './components/LobbyRoom';
import GameBoard from './components/GameBoard';
import ActionPanel from './components/ActionPanel';
import DisconnectHandler from './components/DisconnectHandler';
import { getSocket, getConnectionStatus, getRemembered } from './lib/socket';
import { ThemeContext, useThemeState } from './lib/theme';
import { initializeAudio, playGameSound } from './lib/audio';
import { setupKeyboardNavigation } from './lib/accessibility';
import type { GameSnapshot, LobbyInfo } from './types';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [conn, setConn] = useState(getConnectionStatus());
  const [fadingOut, setFadingOut] = useState(false);
  const themeState = useThemeState();

  // --- Stage scaler state ---
  const stageFitRef = useRef<HTMLDivElement | null>(null);
  const stageContentRef = useRef<HTMLDivElement | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState(0);

  useEffect(() => {
    const fit = stageFitRef.current;
    const content = stageContentRef.current;
    if (!fit || !content) return;

    const recompute = () => {
      const cw = content.scrollWidth || content.clientWidth || 1;
  const ch = content.scrollHeight || content.clientHeight || 1;
  const fw = fit.clientWidth || window.innerWidth;
      const margin = 12;
  // Lock scaling to width only to keep board size stable regardless of panel height.
  const sWidthFit = Math.min(1, (fw - margin) / cw);
  const s = sWidthFit;
      const safeS = Number((s > 0 && isFinite(s) ? s : 1).toFixed(3));
      setStageScale(safeS);
      setScaledHeight(Math.max(0, Math.ceil(ch * safeS)));
    };

    const ro1 = new ResizeObserver(recompute);
    const ro2 = new ResizeObserver(recompute);
    ro1.observe(fit);
    ro2.observe(content);
    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
    setTimeout(recompute, 0);

    return () => {
      ro1.disconnect();
      ro2.disconnect();
      window.removeEventListener('resize', recompute);
      window.removeEventListener('orientationchange', recompute);
    };
  }, []);

  useEffect(() => {
    const s = getSocket();
    const onGameState = (payload: any) => {
      const snap = payload?.snapshot || payload;
      setGame(snap);
      // Persist lobby id for potential reconnect if still in-game
      if (lobby?.id) {
        try { localStorage.setItem('last.active.lobbyId', lobby.id); } catch {}
      }
      // If game over, clear stored lobby id after short delay
      if (snap?.game_over && lobby?.id) {
        setTimeout(() => { try { localStorage.removeItem('last.active.lobbyId'); } catch {} }, 5000);
      }
    };
    const onConn = () => setConn(getConnectionStatus());
    const onSound = (evt: any) => {
      try {
        const e = typeof evt === 'string' ? evt : evt?.event;
        if (e) {
      // Use the current game state to find the proper resolved name
      const storedName = (getRemembered().displayName || '').trim();
      const myName = game?.players?.find((p: any) => p.name === storedName)?.name || storedName;
      playGameSound(e, { myName, ...(evt || {}) });
        }
      } catch (err) {
        console.warn('Failed to play broadcast sound:', err);
      }
    };
    s.on('game_state', onGameState);
    s.on('connect', onConn);
    s.on('disconnect', onConn);
    s.on('sound', onSound);
    
    // Initialize audio system
    initializeAudio().catch(err => {
      console.warn('Failed to initialize audio:', err);
    });
    
    // Setup keyboard navigation
    const cleanupKeyboard = setupKeyboardNavigation();
    
    // Periodic state refresh for active games to combat desync
    const refreshInterval = setInterval(() => {
      if (game && lobby && s.connected) {
        // Request fresh state by re-authing the lobby
        s.emit('auth_lobby', { id: lobby.id });
      }
    }, 10000); // Every 10 seconds
    
    return () => {
      s.off('game_state', onGameState);
      s.off('connect', onConn);
      s.off('disconnect', onConn);
  s.off('sound', onSound);
      clearInterval(refreshInterval);
      cleanupKeyboard();
    };
  }, [game, lobby]);

  return (
    <ThemeContext.Provider value={themeState}>
      <DisconnectHandler />
      <div className="app">
        <div style={{ position: 'fixed', top: 6, right: 8, fontSize: 11, opacity: 0.8 }}>
          {conn.connected ? 'Connected' : 'Reconnecting…'}
        </div>
        <ErrorBoundary>
          {/* Stage fit wrapper scales entire app content including game view */}
          <div className="stage-fit" ref={stageFitRef}>
            <div className="stage-scaler" style={{ transform: `translateX(-50%) scale(${stageScale})`, left: '50%', position: 'absolute', ['--stage-scale' as any]: stageScale }}>
              <div className="stage-content" ref={stageContentRef}>
                {!lobby ? (
                  <MainMenu onEnterLobby={(l) => { setLobby(l); try { localStorage.setItem('last.active.lobbyId', l.id); } catch {} }} />
                ) : !game ? (
                  <LobbyRoom 
                    lobby={lobby} 
                    onGameStarted={() => { /* state updates on game_state */ }} 
                    onBackToMenu={() => { setLobby(null); /* keep last.active.lobbyId for reconnect offer */ }}
                  />
                ) : (
                  <div className="game-view">
                    <GameBoard snapshot={game} lobbyId={lobby.id} />
                    <ActionPanel lobbyId={lobby.id} snapshot={game} />
                    {game?.game_over ? (
                      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, transition: 'opacity 220ms ease', opacity: fadingOut ? 0 : 1 }}>
                        <div style={{ background: '#fff', borderRadius: 10, padding: 16, minWidth: 360, maxWidth: '85vw', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
                          <h2 style={{ marginTop: 0, marginBottom: 8 }}>🏆 Game Over</h2>
                          <div style={{ fontSize: 14, display: 'grid', gap: 6 }}>
                            <div><strong>Winner:</strong> {game.game_over?.winner || '—'}</div>
                            <div><strong>Total turns:</strong> {game.game_over?.turns ?? 0}</div>
                            <div><strong>Most-landed:</strong> {game.game_over?.most_landed?.name || '—'} {typeof game.game_over?.most_landed?.count === 'number' ? `(x${game.game_over?.most_landed?.count})` : ''}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={() => {
                              // Host-only rematch: ask server to create a new lobby with same members
                              const s = getSocket();
                              s.emit('lobby_rematch', { id: lobby?.id }, (resp: any) => {
                                if (resp?.ok && resp.lobby) {
                                  setFadingOut(true);
                                  setTimeout(() => {
                                    // Move UI back to pre-game lobby state with new lobby info
                                    setGame(null);
                                    setLobby(resp.lobby);
                                    setFadingOut(false);
                                  }, 220);
                                }
                              });
                            }}>🔄 New Game</button>
                            <button className="btn" onClick={() => { setFadingOut(true); setTimeout(() => { setGame(null); setLobby(null); setFadingOut(false); }, 220); }}>🏁 Exit to Menu</button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            {/* Spacer keeps outer scroll behavior stable when scaled */}
            <div className="stage-spacer" style={{ height: `${scaledHeight}px`, pointerEvents: 'none' }} />
          </div>
        </ErrorBoundary>
      </div>
    </ThemeContext.Provider>
  );
}
