import { io, Socket } from 'socket.io-client';
import { BACKEND_URL, SOCKET_PATH } from '../config';

let socket: Socket | null = null;
let displayName: string | null = null;

function generateRandomName(): string {
  const ADJ = [
    'Swift','Clever','Bold','Lucky','Bright','Calm','Brave','Mighty','Rapid','Sunny',
    'Noble','Quick','Cool','Happy','Keen','Neon','Icy','Rusty','Royal','Zesty'
  ];
  const ANIMALS = [
    'Fox','Hawk','Panda','Otter','Wolf','Falcon','Tiger','Koala','Raven','Dolphin',
    'Lynx','Bear','Eagle','Cobra','Moose','Seal','Bison','Heron','Whale','Jaguar'
  ];
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const n = Math.floor(Math.random() * 900) + 100; // 100-999
  return `${a} ${b} ${n}`;
}

export function getOrCreateDisplayName(): string {
  try {
    let name = sessionStorage.getItem('displayName') || localStorage.getItem('displayName') || '';
    if (!name) {
      name = generateRandomName();
      sessionStorage.setItem('displayName', name);
    }
    return name;
  } catch {
    return generateRandomName();
  }
}

export function getClientId(): string {
  // One unique ID per browser tab (sessionStorage is tab-scoped)
  try {
    const k = 'clientId';
    let id = sessionStorage.getItem(k) || '';
    if (!id) {
      id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? (crypto as any).randomUUID()
        : `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      sessionStorage.setItem(k, id);
    }
    return id;
  } catch {
    // Fallback if storage unavailable
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

export function getConnectionStatus() {
  const s = getSocket();
  return { connected: s.connected, id: s.id };
}

export function getSocket() {
  if (!socket) {
    // Prefer explicit BACKEND_URL; fallback to current origin (works with Vite proxy)
    const base = BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    socket = io(base, {
      path: SOCKET_PATH,
      // Use default transports for robustness (polling + websocket)
      autoConnect: false,
      auth: { client_id: getClientId() },
    });

    // Re-auth on reconnect (no implicit lobby join)
    socket.on('connect', () => {
      try {
        const savedName = displayName ?? (sessionStorage.getItem('displayName') || localStorage.getItem('displayName') || getOrCreateDisplayName());
        if (savedName) {
          socket!.emit('auth', { display: savedName, client_id: getClientId() });
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
    // If already connected, authenticate and resolve immediately
    if (s.connected) {
      try {
        sessionStorage.setItem('displayName', displayName || getOrCreateDisplayName());
      } catch {}
      s.emit('auth', { display: displayName || getOrCreateDisplayName(), client_id: getClientId() });
      s.emit('lobby_list');
      return resolve();
    }
    const onConnect = () => {
      try {
        sessionStorage.setItem('displayName', displayName || getOrCreateDisplayName());
      } catch {}
      s.emit('auth', { display: displayName || getOrCreateDisplayName(), client_id: getClientId() });
      // Optional: app-level ping for visibility (no-op server-side)
      s.emit('ping', {}, () => {});
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
  try {
    if (id) localStorage.setItem('lastLobbyId', id);
    else localStorage.removeItem('lastLobbyId');
  } catch {}
}

export function getRemembered() {
  try {
    return {
  displayName: sessionStorage.getItem('displayName') || localStorage.getItem('displayName') || '',
      lastLobbyId: localStorage.getItem('lastLobbyId') || '',
    };
  } catch {
    return { displayName: '', lastLobbyId: '' };
  }
}
