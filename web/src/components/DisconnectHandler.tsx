import { useEffect, useState } from 'react';
import { getConnectionStatus, getSocket } from '../lib/socket';

// Simple persistence key for last active lobby the user might reconnect to
const LAST_LOBBY_KEY = 'last.active.lobbyId';

export default function DisconnectHandler() {
  const [countdown, setCountdown] = useState(120); // 2 minutes
  const [showWarning, setShowWarning] = useState(false);
  const [reconnectLobby, setReconnectLobby] = useState<string | null>(null);

  useEffect(() => {
    const s = getSocket();
    let countdownTimer: number | null = null;

    const handleDisconnect = () => {
      const lastLobby = localStorage.getItem(LAST_LOBBY_KEY);
      if (lastLobby) {
        setReconnectLobby(lastLobby);
        setShowWarning(true);
        setCountdown(120);
      } else {
        // No reconnectable lobby -> do not block UI
        setShowWarning(false);
      }

      // Start 2-minute countdown
      countdownTimer = window.setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            setShowWarning(false);
            // Could redirect to menu here
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const handleConnect = () => {
      setShowWarning(false);
      setReconnectLobby(null);
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    };

    s.on('disconnect', handleDisconnect);
    s.on('connect', handleConnect);

  // Initial connection: mark initialized AFTER first connect/disconnect evaluation
    const status = getConnectionStatus();
  if (!status.connected) {
      // If disconnected at mount but no lobby, suppress banner
      const lastLobby = localStorage.getItem(LAST_LOBBY_KEY);
      if (!lastLobby) setShowWarning(false);
    }

    return () => {
      s.off('disconnect', handleDisconnect);
      s.off('connect', handleConnect);
      if (countdownTimer) clearInterval(countdownTimer);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!showWarning) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
      color: 'white',
      padding: '12px 16px',
      textAlign: 'center',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: 2000,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      animation: 'disconnectPulse 2s ease-in-out infinite'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span>🔌</span>
        <span>Connection lost! Attempting to reconnect...</span>
        <span style={{ 
          background: 'rgba(255,255,255,0.2)', 
          padding: '4px 8px', 
          borderRadius: '4px',
          fontFamily: 'monospace'
        }}>
          {formatTime(countdown)}
        </span>
        {reconnectLobby ? (
          <button
            style={{
              background: 'rgba(255,255,255,0.25)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.4)',
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer'
            }}
            onClick={() => {
              try {
                const s = getSocket();
                if (reconnectLobby) {
                  s.emit('auth_lobby', { id: reconnectLobby });
                }
              } catch {}
            }}
          >Reconnect</button>
        ) : null}
      </div>
      <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.9 }}>
        {reconnectLobby ? 'You can attempt to rejoin your previous game while the timer is active.' : 'Attempting reconnection...'}
      </div>
    </div>
  );
}
