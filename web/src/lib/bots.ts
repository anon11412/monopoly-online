import { io, Socket } from 'socket.io-client';
import { BACKEND_URL, SOCKET_PATH } from '../config';
import { getClientId } from './socket';

export type BotHandle = { id: string; name: string; socket: Socket; stop: () => void };

export async function spawnBot(lobbyId: string, name: string): Promise<BotHandle> {
  const socket = io(BACKEND_URL || window.location.origin, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    forceNew: true,
  });
  const done = new Promise<void>((resolve, reject) => {
    let timeout: any;
    const cleanup = () => {
      socket.off('lobby_state', onState);
      socket.off('lobby_joined', onState);
      if (timeout) clearTimeout(timeout);
    };
    const onState = (payload: any) => {
      if (payload?.id === lobbyId) {
        console.debug('[bot] joined via broadcast', payload);
        cleanup();
        socket.emit('lobby_ready', { id: lobbyId, ready: true });
        resolve();
      }
    };
    socket.once('connect', () => {
      console.debug('[bot] connect', { lobbyId, name });
      socket.emit('auth', { display: name, client_id: getClientId() });
  // Nudge server to process auth by requesting lobby_list, then join shortly after
  socket.emit('lobby_list');
      socket.on('lobby_state', onState);
      socket.on('lobby_joined', onState);
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error('bot join timeout'));
      }, 5000);
  setTimeout(() => socket.emit('lobby_join', { id: lobbyId, lobby_id: lobbyId }, (resp: any) => {
        console.debug('[bot] lobby_join ack', resp);
        if (resp?.ok || resp?.lobby) {
          cleanup();
          socket.emit('lobby_ready', { id: lobbyId, ready: true });
          resolve();
        } else if (resp && resp.error) {
          cleanup();
          reject(new Error(`bot join failed: ${resp.error}`));
        }
  }), 100);
    });
    socket.once('connect_error', (e) => reject(e));
  });
  await done;
  return {
    id: socket.id || '',
    name,
    socket,
    stop: () => { try { socket.disconnect(); } catch { /* noop */ } },
  };
}
