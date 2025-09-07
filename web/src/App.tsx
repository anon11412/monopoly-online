import { useEffect, useState } from 'react';
import MainMenu from './components/MainMenu';
import LobbyRoom from './components/LobbyRoom';
import GameBoard from './components/GameBoard';
import ActionPanel from './components/ActionPanel';
import { getSocket, getConnectionStatus } from './lib/socket';
import type { GameSnapshot, LobbyInfo } from './types';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [conn, setConn] = useState(getConnectionStatus());

  useEffect(() => {
    const s = getSocket();
    const onGameState = (payload: any) => {
      setGame(payload?.snapshot || payload);
    };
    const onConn = () => setConn(getConnectionStatus());
    s.on('game_state', onGameState);
    s.on('connect', onConn);
    s.on('disconnect', onConn);
    return () => {
      s.off('game_state', onGameState);
      s.off('connect', onConn);
      s.off('disconnect', onConn);
    };
  }, []);

  return (
    <div className="app">
      <div style={{ position: 'fixed', top: 6, right: 8, fontSize: 11, opacity: 0.8 }}>
        {conn.connected ? 'Connected' : 'Reconnecting…'}
      </div>
      <ErrorBoundary>
        {!lobby ? (
          <MainMenu onEnterLobby={(l) => setLobby(l)} />
        ) : !game ? (
          <LobbyRoom lobby={lobby} onGameStarted={() => { /* state updates on game_state */ }} />
        ) : (
          <div className="game-view">
            <GameBoard snapshot={game} lobbyId={lobby.id} />
            <ActionPanel lobbyId={lobby.id} snapshot={game} />
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}
