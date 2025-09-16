import { useEffect, useRef, useState } from 'react';
import { getSocket, getRemembered } from '../lib/socket';
import { normalizeName } from '../lib/names';

export default function ChatPanel({ lobbyId }: { lobbyId: string }) {
  const s = getSocket();
  const [chatLog, setChatLog] = useState<Array<{ from: string; message: string; ts?: number }>>([]);
  const [chatMsg, setChatMsg] = useState('');
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const storedName = (getRemembered().displayName || '').trim();

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
    const onLobbyState = (data: any) => {
      if (!data || (data.id && data.id !== lobbyId)) return;
      const hist = Array.isArray((data as any).chat) ? (data as any).chat : [];
      const mapped = hist.map((c: any) => ({ from: c.from || 'anon', message: c.message || '', ts: c.ts ? Number(c.ts) : undefined }));
      setChatLog(mapped);
    };
    s.on('chat_message', onChat);
    s.on('lobby_state', onLobbyState);
    // Request a fresh lobby snapshot without changing membership
    try { s.emit('get_lobby', { id: lobbyId, lobby_id: lobbyId }); } catch {}
    return () => { s.off('chat_message', onChat); s.off('lobby_state', onLobbyState); };
  }, [s, lobbyId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
    // Persist chat to keep GameBoard and Dashboard panels in sync per lobby
    try { sessionStorage.setItem(`chat:${lobbyId}`, JSON.stringify(chatLog)); } catch {}
  }, [chatLog]);

  const sendChat = () => {
    const text = chatMsg.trim();
    if (!text) return;
    setChatMsg('');
    try { s.emit('chat_send', { id: lobbyId, message: text }); } catch {}
  };

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr auto', height: '100%', border: '1px solid var(--color-border)', borderRadius: 8, minWidth: 0, position: 'relative', background: 'var(--color-surface)' }}>
      <div ref={messagesRef} style={{ overflowY: 'auto', padding: 8 }}>
        {chatLog.length === 0 ? (
          <div className="ui-sm" style={{ opacity: 0.7 }}>No messages</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {chatLog.map((c, i) => (
              <li key={i} style={{ fontSize: 12, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                <strong>{normalizeName(c.from)}</strong>
                <span style={{ opacity: 0.65 }}>:</span> {c.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', padding: 6, display: 'flex', gap: 6, paddingRight: 66 }}>
        <input
          type="text"
          value={chatMsg}
          onChange={e => setChatMsg(e.target.value)}
          placeholder={`Message as ${storedName || 'me'}`}
          className="input"
          style={{ flex: 1, maxWidth: 'calc(100% - 120px)', fontSize: 12, padding: '6px 8px', height: 28, lineHeight: 1.2, borderRadius: 6 }}
          onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
        />
        <button className="btn" onClick={sendChat} style={{ height: 28, padding: '0 10px', fontSize: 12 }}>Send</button>
      </div>
    </div>
  );
}
