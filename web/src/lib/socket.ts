import { io, Socket } from 'socket.io-client';
import { BACKEND_URL, SOCKET_PATH } from '../config';

let socket: Socket | null = null;
let displayName: string | null = null;

// Diagnostics helper to expose resolved backend info
export function getResolvedSocketConfig() {
  return { base: BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : ''), path: SOCKET_PATH };
}

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
    const base = BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    console.debug('[socket] initializing', { base, SOCKET_PATH });
    socket = io(base, {
      path: SOCKET_PATH,
      autoConnect: false,
      auth: { client_id: getClientId() },
    });

    // Lifecycle diagnostics
    socket.on('connect', () => {
      console.debug('[socket] connect', { id: socket?.id });
      try {
        const savedName = displayName ?? (sessionStorage.getItem('displayName') || localStorage.getItem('displayName') || getOrCreateDisplayName());
        if (savedName) {
          socket!.emit('auth', { display: savedName, client_id: getClientId() });
        }
      } catch {}
    });
    socket.on('disconnect', (reason) => {
      console.warn('[socket] disconnect', { reason });
    });
    socket.io.on('reconnect_attempt', (attempt) => {
      console.debug('[socket] reconnect_attempt', { attempt });
    });
    socket.io.on('reconnect', (n) => {
      console.debug('[socket] reconnect success', { n });
    });
    socket.io.on('error', (err) => {
      console.error('[socket] manager error', err);
    });
    socket.on('connect_error', (err) => {
      console.error('[socket] connect_error', err);
    });
  }
  return socket;
}

export function connectSocket(displayName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    console.debug('[socket] connectSocket called', { alreadyConnected: s.connected, displayName });
    if (s.connected) {
      try {
        sessionStorage.setItem('displayName', displayName || getOrCreateDisplayName());
      } catch {}
      s.emit('auth', { display: displayName || getOrCreateDisplayName(), client_id: getClientId() });
      s.emit('lobby_list');
      return resolve();
    }
    const onConnect = () => {
      console.debug('[socket] onConnect handler');
      try {
        sessionStorage.setItem('displayName', displayName || getOrCreateDisplayName());
      } catch {}
      s.emit('auth', { display: displayName || getOrCreateDisplayName(), client_id: getClientId() });
      s.emit('ping', {}, () => {});
      s.off('connect', onConnect);
      s.off('connect_error', onError);
      resolve();
    };
    const onError = (err: any) => {
      console.error('[socket] onError', err);
      s.off('connect_error', onError);
      s.off('connect', onConnect);
      reject(err);
    };
    s.on('connect', onConnect);
    s.on('connect_error', onError);
    try {
      console.debug('[socket] initiating transport connect');
      s.connect();
    } catch (e) {
      console.error('[socket] immediate connect throw', e);
      s.off('connect', onConnect);
      s.off('connect_error', onError);
      reject(e);
    }
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
