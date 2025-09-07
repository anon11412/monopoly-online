import { io, Socket } from 'socket.io-client';
import { BACKEND_URL, SOCKET_PATH } from '../config';

let socket: Socket | null = null;
let displayName: string | null = null;
let lastLobbyId: string | null = null;

export function getConnectionStatus() {
  const s = getSocket();
  return { connected: s.connected, id: s.id };
}

export function getSocket() {
  if (!socket) {
    socket = io(BACKEND_URL, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      autoConnect: false,
    });

    // Auto re-auth and rejoin
    socket.on('connect', () => {
      try {
        const savedName = displayName ?? localStorage.getItem('displayName');
        if (savedName) {
          socket!.emit('auth', { display: savedName });
        }
        const savedLobby = lastLobbyId ?? localStorage.getItem('lastLobbyId');
        if (savedLobby) {
          // ask server for latest state; if join is needed, emit join
          socket!.emit('lobby_join', { id: savedLobby, lobby_id: savedLobby });
        }
      } catch {}
    });
    socket.on('disconnect', (reason) => {
      // eslint-disable-next-line no-console
      console.warn('Socket disconnected:', reason);
    });
  }
  return socket;
}

export function connectSocket(displayName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    const onConnect = () => {
      try {
        localStorage.setItem('displayName', displayName);
      } catch {}
      s.emit('auth', { display: displayName });
      s.off('connect', onConnect);
      resolve();
    };
    const onError = (err: any) => {
      s.off('connect_error', onError);
      reject(err);
    };
    s.on('connect', onConnect);
    s.on('connect_error', onError);
    s.connect();
  });
}

export function rememberLobby(id: string | null) {
  lastLobbyId = id;
  try {
    if (id) localStorage.setItem('lastLobbyId', id);
    else localStorage.removeItem('lastLobbyId');
  } catch {}
}

export function getRemembered() {
  try {
    return {
      displayName: localStorage.getItem('displayName') || '',
      lastLobbyId: localStorage.getItem('lastLobbyId') || '',
    };
  } catch {
    return { displayName: '', lastLobbyId: '' };
  }
}
