import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';
import { normalizeName } from '../lib/names';
import { useAutoScroll } from '../hooks/useAutoScroll';

export default function ChatPanel({ lobbyId }: { lobbyId: string }) {
  const s = getSocket();
  const [chatLog, setChatLog] = useState<Array<{ from: string; message: string; ts?: number }>>([]);
  const [playerColors, setPlayerColors] = useState<Record<string,string>>({});
  const colorsFrozenRef = useRef(false);
  const [chatMsg, setChatMsg] = useState('');
  const { ref: messagesRef } = useAutoScroll<HTMLDivElement>([chatLog], { 
    smooth: true, 
    enabled: true,
    threshold: 30 
  });

  useEffect(() => {
    // Load from storage first for instant UI, then ask server for source of truth
    try {
      const raw = sessionStorage.getItem(`chat:${lobbyId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setChatLog(parsed);
      }
    } catch {}

    const onChat = (msg: any) => {
      if (!msg || (msg.lobby_id && msg.lobby_id !== lobbyId)) return;
      const from = msg.from || 'anon';
      const text = msg.message || '';
      const ts = msg.ts || Date.now();
      setChatLog(prev => [...prev, { from, message: text, ts }]);
    };
    const mergeColors = (incoming: Record<string,string>, finalize = false) => {
      setPlayerColors(prev => {
        const out: Record<string,string> = { ...prev };
        Object.entries(incoming).forEach(([k,v]) => {
          if (colorsFrozenRef.current && out[k]) return; // don't mutate existing when frozen
          if (!out[k]) out[k] = v;
          const norm = normalizeName(k);
          if (!out[norm]) out[norm] = v;
          const lower = k.toLowerCase();
          if (!out[lower]) out[lower] = v;
        });
        if (finalize) colorsFrozenRef.current = true;
        if (typeof window !== 'undefined') (window as any).CHAT_COLOR_MAP = out;
        return out;
      });
    };

    const onLobbyState = (data: any) => {
      if (!data || (data.id && data.id !== lobbyId)) return;
      const hist = Array.isArray((data as any).chat) ? (data as any).chat : [];
      const mapped = hist.map((c: any) => ({ from: c.from || 'anon', message: c.message || '', ts: c.ts ? Number(c.ts) : undefined }));
      setChatLog(mapped);
      // Use explicit player_colors only; freeze after first acquisition
      if ((data as any).player_colors && typeof (data as any).player_colors === 'object') {
        mergeColors((data as any).player_colors as Record<string,string>, true);
      }
    };
    const onGameState = (payload: any) => {
      if (!payload || (payload.lobby_id && payload.lobby_id !== lobbyId)) return;
      const snap = payload.snapshot || payload; // server sends { lobby_id, snapshot }
      if (snap && snap.player_colors && typeof snap.player_colors === 'object') {
        mergeColors(snap.player_colors as Record<string,string>, true);
      }
    };
    s.on('chat_message', onChat);
    s.on('lobby_state', onLobbyState);
  s.on('game_state', onGameState);
    // Request a fresh lobby snapshot without changing membership
    try { s.emit('get_lobby', { id: lobbyId, lobby_id: lobbyId }); } catch {}
    return () => { s.off('chat_message', onChat); s.off('lobby_state', onLobbyState); s.off('game_state', onGameState); };
  }, [s, lobbyId]);

  useEffect(() => {
    // Persist chat to keep GameBoard and Dashboard panels in sync per lobby
    try { sessionStorage.setItem(`chat:${lobbyId}`, JSON.stringify(chatLog)); } catch {}
  }, [chatLog, lobbyId]);

  const sendChat = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = chatMsg.trim();
    if (!text) return;
    setChatMsg('');
    try { s.emit('chat_send', { id: lobbyId, message: text }); } catch {}
  };

  const getColor = (name: string): string => {
    const normalized = normalizeName(name);
    return playerColors[name] || playerColors[normalized] || playerColors[name.toLowerCase()] || '#666666';
  };

  return (
    <div style={{ width: '100%', height: '100%', maxHeight: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div ref={messagesRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, maxHeight: '100%', padding: '12px 0' }}>
        {chatLog.length === 0 ? (
          <div style={{ opacity: 0.6, fontSize: 32, padding: 24 }}>No messages yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {chatLog.map((m, i) => (
              <li key={i} style={{ padding: '8px 12px', fontSize: 32, wordBreak: 'break-word', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700, color: getColor(m.from), fontSize: 34 }}>{normalizeName(m.from)}</span>
                <span style={{ opacity: 0.7 }}>: </span>
                <span>{m.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ flexShrink: 0, padding: '12px 0', borderTop: '2px solid var(--color-border)' }}>
        <form onSubmit={sendChat} style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            className="input"
            value={chatMsg}
            onChange={(e) => setChatMsg(e.target.value)}
            placeholder="Type a message..."
            style={{ flex: 1, fontSize: 32, height: 72, padding: '16px 20px' }}
          />
          <button type="submit" className="btn" style={{ fontSize: 28, height: 72, padding: '0 32px', minWidth: 120 }}>Send</button>
        </form>
      </div>
    </div>
  );
}
