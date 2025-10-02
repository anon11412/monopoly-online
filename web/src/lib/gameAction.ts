import { getSocket } from './socket';

export type GameAction = { type: string; [k: string]: any };
export type EmitOptions = {
  lobbyId?: string;
  onAck?: (ack: any) => void;
  onError?: (err: any) => void;
  debugTag?: string;
};

export function emitGameAction(lobbyId: string | undefined, action: GameAction, opts: EmitOptions = {}) {
  const s = getSocket();
  const finalLobby = lobbyId || (window as any).__lobbyId || '';
  const payload = { id: finalLobby, action };
  try {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[emitGameAction]', opts.debugTag || action.type, payload);
    }
    s.emit('game_action', payload, (ack: any) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[emitGameAction][ack]', action.type, ack);
      }
      if (ack && ack.ok === false) {
        opts.onError?.(ack);
      } else {
        opts.onAck?.(ack);
      }
    });
  } catch (err) {
    opts.onError?.(err);
  }
}
