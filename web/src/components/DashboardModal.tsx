import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameSnapshot } from '../types';
import { getSocket, getRemembered } from '../lib/socket';
import { normalizeName, equalNames } from '../lib/names';

type Props = {
  open: boolean;
  onClose: () => void;
  lobbyId: string;
  snapshot: GameSnapshot;
};

export default function DashboardModal({ open, onClose, lobbyId, snapshot }: Props) {
  // Responsive behavior handled by CSS grid; no window listeners required here

  if (!open) return null;

  // Center the dashboard relative to the full viewport
  const panelWidth = 'min(1200px, 96vw)';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 3000 }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '4vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: panelWidth,
          maxHeight: '92vh',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--elev-4)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="ui-h3">📊 Dashboard</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'grid', gap: 8, overflow: 'hidden', paddingBottom: 8, minHeight: 0, flex: 1 }}>
          <DashboardGrid lobbyId={lobbyId} snapshot={snapshot} />
        </div>
      </div>
    </div>
  );
}

// Keep log component above DashboardGrid to avoid any HMR/hoisting quirks
// (moved above DashboardGrid)

function DashboardGrid({ lobbyId, snapshot }: { lobbyId: string; snapshot: GameSnapshot }) {
  // Resolve my name for spending/transactions context
  const storedName = (getRemembered().displayName || '').trim();
  const myName = useMemo(() => {
    const found = (snapshot?.players || []).find(p => equalNames(p.name, storedName));
    return found?.name || storedName || '';
  }, [snapshot?.players, storedName]);

  // Transactions list is not currently displayed; compute on demand when adding UI

  // Simple spending aggregation by category from log text
  const spendingAgg = useMemo(() => {
    const agg: Record<string, number> = { Rent: 0, Properties: 0, Fees: 0, Trades: 0 };
    const me = myName || '';
    for (const e of (snapshot.log || []) as any[]) {
      const t = String(e.type || '');
      const txt = String(e.text || '').toLowerCase();
      const isMe = txt.includes(normalizeName(me).toLowerCase());
      if (!isMe) continue;
      const amt = extractAmount(txt);
      if (!amt) continue;
      if (t.includes('rent') || /rent/.test(txt)) agg.Rent += Math.abs(amt);
      else if (/buy|house|hotel|property/.test(txt)) agg.Properties += Math.abs(amt);
      else if (/tax|fee|fine|income\s+tax|luxury/.test(txt)) agg.Fees += Math.abs(amt);
      else if (/trade/.test(txt)) agg.Trades += Math.abs(amt);
    }
    const total = Object.values(agg).reduce((a, b) => a + b, 0) || 1;
    const entries = Object.entries(agg).map(([k, v]) => ({ label: k, value: v, pct: v / total }));
    // Sort by value desc for bars
    entries.sort((a, b) => b.value - a.value);
    return entries;
  }, [snapshot.log, myName]);

  // Live balance series (client-side) for the current player; use snapshot.turns when available for x
  const balanceSeriesRef = useRef<Array<{ x: number; value: number }>>([]);
  const curCash = (snapshot.players || []).find(p => equalNames(p.name, myName))?.cash ?? 0;
  useEffect(() => {
    // Reset history when player identity changes
    balanceSeriesRef.current = [];
  }, [myName]);
  useEffect(() => {
    const series = balanceSeriesRef.current;
    const last = series.length ? series[series.length - 1].value : undefined;
    if (last !== curCash) {
      const x = typeof (snapshot as any)?.turns === 'number' ? Number((snapshot as any).turns) : series.length;
      // Avoid duplicate x values
      if (series.length && series[series.length - 1].x === x) {
        series[series.length - 1] = { x, value: curCash };
      } else {
        series.push({ x, value: curCash });
      }
      if (series.length > 120) series.splice(0, series.length - 120); // keep last 120 points
    }
  }, [curCash, snapshot.turns, snapshot.last_action]);

  // Stocks and bonds data (fallback to empty arrays)
  const rawStocks = ((snapshot as any)?.stocks as any[] | undefined) || [];
  const rawBonds = ((snapshot as any)?.bonds as any[] | undefined) || [];
  // One chart per player (owner): dedupe by owner name
  const stocksByOwner = useMemo(() => {
    const map = new Map<string, any>();
    for (const st of rawStocks) {
      const key = (st?.owner || '').toLowerCase();
      if (key && !map.has(key)) map.set(key, st);
    }
    return Array.from(map.values());
  }, [rawStocks]);
  const bondsByOwner = useMemo(() => {
    const map = new Map<string, any>();
    for (const b of rawBonds) {
      const key = (b?.owner || '').toLowerCase();
      if (key && !map.has(key)) map.set(key, b);
    }
    return Array.from(map.values());
  }, [rawBonds]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'clamp(180px, 22vw, 240px) 1fr 1fr clamp(200px, 24vw, 280px)', gap: 12, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      {/* Column 1: Game Log (top) + Game Chat (bottom 65%) */}
      <div style={{ display: 'grid', gridTemplateRows: '35% 65%', height: '100%', minWidth: 0, minHeight: 0, gap: 12 }}>
        <div className="ui-labelframe" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="ui-h3" style={{ marginBottom: 6 }}>Game Log</div>
          <GameLogPanel snapshot={snapshot} />
        </div>
        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
          <div className="ui-h3" style={{ marginBottom: 6 }}>💬 Game Chat</div>
          <ChatPanel lobbyId={lobbyId} />
        </div>
      </div>

      {/* Column 2: Top 70% (Balance + Spending in one container), Bottom 30% (Payments + Rentals) */}
      <div style={{ display: 'grid', gap: 12, gridTemplateRows: '70% 30%', height: '100%', minWidth: 0, minHeight: 0 }}>
        {/* Combined container */}
        <div className="ui-labelframe" style={{ display: 'grid', gridTemplateRows: '3fr 2fr', minHeight: 0 }}>
          {/* Balance Summary */}
          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="ui-h3" style={{ marginBottom: 6 }}>Balance Summary</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', minHeight: 0 }}>
              <div>
                <div className="ui-sm" style={{ opacity: 0.8 }}>Player</div>
                <div style={{ fontWeight: 700 }}>{normalizeName(myName || (snapshot.players?.[snapshot.current_turn]?.name || '—'))}</div>
                <div className="ui-sm" style={{ opacity: 0.8 }}>Balance</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>${(snapshot.players || []).find(p => equalNames(p.name, myName))?.cash ?? '—'}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
                {balanceSeriesRef.current.length > 1 ? (
                  <LineChart data={balanceSeriesRef.current as any[]} xKey="x" yKey="value" height={160} showAxes />
                ) : (
                  <Sparkline height={160} showAxes />
                )}
              </div>
            </div>
          </div>
          {/* Spending */}
          <div style={{ minHeight: 0 }}>
            <div className="ui-h3" style={{ marginBottom: 6 }}>Spending</div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, minHeight: 0 }}>
              <div style={{ display: 'grid', placeItems: 'center' }}>
                {/* Donut with inner radius (live from log) */}
                <PieChart entries={spendingAgg} size={180} inner={60} legend={false} />
              </div>
              <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                {spendingAgg.slice(0, 3).map((e, i) => (
                  <div key={i}>
                    <div className="ui-sm" style={{ marginBottom: 2 }}>{e.label} — ${e.value.toFixed(0)}</div>
                    <div style={{ height: 10, background: 'var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, Math.round(e.pct * 100))}%`, height: '100%', background: 'var(--color-accent)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Payments + Rentals summary */}
        <div className="ui-labelframe" style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="ui-h3" style={{ marginBottom: 6 }}>Per Turn Payments</div>
            <div className="ui-sm" style={{ flex: 1, overflowY: 'auto' }}>
              {((snapshot as any).recurring || []).length === 0 ? (
                <div style={{ opacity: 0.7 }}>None</div>
              ) : ((snapshot as any).recurring || []).map((r: any, idx: number) => (
                <div key={idx}>{normalizeName(r.from)} → {normalizeName(r.to)}: ${r.amount} ({r.turns_left} left)</div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="ui-h3" style={{ marginBottom: 6 }}>Rentals</div>
            <div className="ui-sm" style={{ flex: 1, overflowY: 'auto' }}>
              {((snapshot as any).property_rentals || []).length === 0 ? (
                <div style={{ opacity: 0.7 }}>Empty</div>
              ) : ((snapshot as any).property_rentals || []).map((r: any, idx: number) => (
                <div key={idx} style={{ overflowWrap: 'anywhere' }}>
                  {normalizeName(r.renter)} → {normalizeName(r.owner)}: {r.percentage}% of rent from {(r.properties || []).join(', ')} ({r.turns_left} left)
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Column 3: All Stocks */}
      <div className="ui-labelframe" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <div className="ui-h3" style={{ marginBottom: 6 }}>Stocks</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(200px, 1fr)', gap: 10, minHeight: 0, overflowY: 'auto' }}>
          {stocksByOwner.map((row: any, i: number) => {
            return (
              <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row ? normalizeName(row.owner) : `Stock ${i + 1}`}</div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  {row?.history && row.history.length ? (
                    <LineChart data={row.history as any[]} xKey="turn" yKey="pool" height={140} showAxes />
                  ) : (
                    <Sparkline height={140} showAxes />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                  <button className="btn btn-ghost">Buy</button>
                  <button className="btn btn-ghost">Sell</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Column 4: Bonds — charts (top ~90%), payouts (bottom ~10%) */}
      <div className="ui-labelframe" style={{ display: 'grid', gridTemplateRows: '9fr 1fr', gap: 8, minWidth: 0, minHeight: 0 }}>
        {/* Bonds charts area */}
        <div style={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="ui-h3" style={{ marginBottom: 6 }}>Bonds Charts</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(200px, 1fr)', gap: 10, minHeight: 0, overflowY: 'auto' }}>
            {bondsByOwner.map((row: any, i: number) => {
              return (
                <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row ? normalizeName(row.owner) : `Bond ${i + 1}`}</div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    {row?.history && row.history.length ? (
                      <LineChart data={row.history as any[]} xKey="turn" yKey="rate" height={140} showAxes />
                    ) : (
                      <Sparkline height={140} showAxes />
                    )}
                  </div>
                  {row ? (
                    <div className="ui-xs" style={{ marginTop: 6, opacity: 0.8 }}>Rate {row.rate_percent || 0}% • Every {row.period_turns || 1}t</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        {/* Payouts summary (bottom band ~10%) */}
        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="ui-h3" style={{ marginBottom: 4 }}>Payouts</div>
          <div className="ui-sm" style={{ flex: 1, overflowY: 'auto' }}>
            {(!bondsByOwner || bondsByOwner.length === 0) ? (
              <div style={{ opacity: 0.7 }}>None</div>
            ) : bondsByOwner.map((row: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
                <span title={row.owner} style={{ width: 8, height: 8, borderRadius: '50%', background: row.owner_color || '#999', display: 'inline-block' }} />
                <span style={{ fontWeight: 600 }}>{normalizeName(row.owner)}</span>
                <span style={{ opacity: 0.8 }}>• {row.rate_percent || 0}% every {row.period_turns || 1}t</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPanel({ lobbyId }: { lobbyId: string }) {
  const s = getSocket();
  const [chatLog, setChatLog] = useState<Array<{ from: string; message: string; ts?: number }>>([]);
  const [chatMsg, setChatMsg] = useState('');
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const storedName = (getRemembered().displayName || '').trim();

  useEffect(() => {
    const onChat = (msg: any) => {
      if (!msg) return;
      const from = msg.from || 'anon';
      const text = msg.message || '';
      const ts = msg.ts || Date.now();
      setChatLog(prev => [...prev, { from, message: text, ts }]);
    };
    const onJoined = (data: any) => {
      if (!data || (data.id && data.id !== lobbyId)) return;
      const hist = Array.isArray((data as any).chat) ? (data as any).chat : [];
      const mapped = hist.map((c: any) => ({ from: c.from || 'anon', message: c.message || '', ts: c.ts ? Number(c.ts) : undefined }));
      setChatLog(mapped);
    };
    s.on('chat_message', onChat);
    s.on('lobby_joined', onJoined);
    // hydrate if connected
    try { s.emit('lobby_join', { id: lobbyId, lobby_id: lobbyId }); } catch {}
    return () => { s.off('chat_message', onChat); s.off('lobby_joined', onJoined); };
  }, [s, lobbyId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
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
      <div style={{ borderTop: '1px solid var(--color-border)', padding: 6, display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={chatMsg}
          onChange={e => setChatMsg(e.target.value)}
          placeholder={`Message as ${storedName || 'me'}`}
          className="input"
          style={{ flex: 1, fontSize: 12, padding: '6px 8px', height: 28, lineHeight: 1.2, borderRadius: 6 }}
          onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
        />
        <button className="btn" onClick={sendChat} style={{ height: 28, padding: '0 10px', fontSize: 12 }}>Send</button>
      </div>
    </div>
  );
}

function GameLogPanel({ snapshot }: { snapshot: GameSnapshot }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [snapshot?.log]);
  const items = (snapshot?.log || []).slice(-80);
  const icon = (t: string) => (t === 'rolled' ? '🎲' : t === 'buy' ? '🏠' : t === 'end_turn' ? '⏭' : t === 'bankrupt' ? '💥' : '•');
  return (
    <div ref={ref} style={{ fontSize: 11, flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {items.length === 0 ? (
        <div style={{ opacity: 0.6 }}>No log entries.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((e: any, i: number) => (
            <li key={i} style={{ padding: '2px 0', borderBottom: '1px dotted var(--color-border)' }}>
              <span style={{ marginRight: 4 }}>{icon(String(e.type || ''))}</span>
              <span>{e.text || JSON.stringify(e)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Sparkline({ height = 100, showAxes = false }: { height?: number; showAxes?: boolean }) {
  // Simple placeholder sparkline using a sine-like curve. Uses a fixed viewBox width so it scales to container width.
  const baseW = 300;
  // Dynamic axis padding; smaller clamp for mini charts to preserve plot height
  const pad = showAxes
    ? (height <= 120
        ? Math.max(12, Math.min(18, Math.round(height * 0.14)))
        : Math.max(16, Math.min(24, Math.round(height * 0.18))))
    : 6;
  const innerW = baseW - pad * 2;
  const innerH = height - pad * 2;
  const points = useMemo(() => {
    const pts: Array<[number, number]> = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const x = pad + (i / n) * innerW;
      const y = pad + innerH - (Math.sin(i / 2.2) * 0.5 + 0.5) * innerH + (Math.random() - 0.5) * Math.min(6, innerH * 0.1);
      pts.push([x, Math.max(pad, Math.min(height - pad, y))]);
    }
    return pts;
  }, [height, pad, innerW, innerH]);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const xTicks = showAxes ? 5 : 0;
  const yTicks = showAxes ? 4 : 0;
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => pad + (i / xTicks) * innerW);
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => pad + (i / yTicks) * innerH);
  return (
    <svg
      viewBox={`0 0 ${baseW} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {showAxes && (
        <>
          {/* Axes */}
          <line x1={pad} y1={height - pad} x2={baseW - pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
          {/* Grid + labels (generic placeholders) */}
          {xTickVals.map((x, i) => (
            <g key={`x-${i}`}>
              <line x1={x} y1={pad} x2={x} y2={height - pad} stroke="#f2f2f2" strokeWidth={1} />
              <text x={x} y={height - pad + 14} fontSize={9} textAnchor="middle" fill="#666" fontFamily="system-ui">{i}</text>
            </g>
          ))}
          {yTickVals.map((y, i) => (
            <g key={`y-${i}`}>
              <line x1={pad} y1={y} x2={baseW - pad} y2={y} stroke="#f2f2f2" strokeWidth={1} />
              <text x={pad - 6} y={y} fontSize={9} textAnchor="end" dominantBaseline="middle" fill="#666" fontFamily="system-ui">{(yTicks - i) * 10}</text>
            </g>
          ))}
        </>
      )}
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
      {points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.5} fill="var(--color-accent)" />)}
    </svg>
  );
}

function PieChart({ entries, size = 140, legend = true, inner = 0 }: { entries: Array<{ label: string; value: number; pct: number }>; size?: number; legend?: boolean; inner?: number }) {
  const total = entries.reduce((a, b) => a + b.value, 0) || 1;
  let acc = 0;
  const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63'];
  const r = size / 2;
  const innerR = Math.max(0, Math.min(r - 2, inner));
  const cx = r, cy = r;
  const segs = entries.map((e, i) => {
    const start = (acc / total) * Math.PI * 2;
    acc += e.value;
    const end = (acc / total) * Math.PI * 2;
    const [x1, y1] = [cx + r * Math.cos(start), cy + r * Math.sin(start)];
    const [x2, y2] = [cx + r * Math.cos(end), cy + r * Math.sin(end)];
    const largeArc = end - start > Math.PI ? 1 : 0;
    if (innerR > 0) {
      // Donut segment: outer arc + inner arc back
      const [ix2, iy2] = [cx + innerR * Math.cos(end), cy + innerR * Math.sin(end)];
      const [ix1, iy1] = [cx + innerR * Math.cos(start), cy + innerR * Math.sin(start)];
      const d = `M ${x1} ${y1}
                 A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}
                 L ${ix2} ${iy2}
                 A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1}
                 Z`;
      return <path key={i} d={d} fill={colors[i % colors.length]} stroke="white" strokeWidth={1} />;
    } else {
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return <path key={i} d={d} fill={colors[i % colors.length]} stroke="white" strokeWidth={1} />;
    }
  });
  return (
    <div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{segs}</svg>
      {legend && (
        <div className="ui-sm" style={{ display: 'grid', gap: 4, marginTop: 6 }}>
          {entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, background: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63'][i % 5], display: 'inline-block', borderRadius: 2 }} />
              <span>{e.label}</span>
              <span style={{ marginLeft: 'auto' }}>${e.value.toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Generic line chart that accepts x/y keys and data arrays
function LineChart({ data, xKey, yKey, color = 'var(--color-accent)', height = 120, showAxes = true }:
  { data: Array<Record<string, number>>; xKey: string; yKey: string; color?: string; height?: number; showAxes?: boolean }) {
  const baseW = 300;
  const pad = showAxes ? Math.max(12, Math.min(20, Math.round(height * 0.14))) : 6;
  const innerW = baseW - pad * 2;
  const innerH = height - pad * 2;
  const xs = data.map(d => d[xKey]);
  const ys = data.map(d => d[yKey]);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const x = (v: number) => pad + ((v - minX) / Math.max(1e-6, (maxX - minX))) * innerW;
  const y = (v: number) => pad + innerH - ((v - minY) / Math.max(1e-6, (maxY - minY))) * innerH;
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d[xKey])} ${y(d[yKey])}`).join(' ');
  const xticks = showAxes ? 5 : 0;
  const yticks = showAxes ? 4 : 0;
  const xTickVals = Array.from({ length: xticks + 1 }, (_, i) => minX + (i / Math.max(1, xticks)) * (maxX - minX));
  const yTickVals = Array.from({ length: yticks + 1 }, (_, i) => minY + (i / Math.max(1, yticks)) * (maxY - minY));
  return (
    <svg viewBox={`0 0 ${baseW} ${height}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      {showAxes && (
        <>
          <line x1={pad} y1={height - pad} x2={baseW - pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
          {xTickVals.map((v, i) => (
            <g key={`x-${i}`}>
              <line x1={x(v)} y1={pad} x2={x(v)} y2={height - pad} stroke="#f2f2f2" strokeWidth={1} />
              <text x={x(v)} y={height - pad + 12} fontSize={9} textAnchor="middle" fill="#666">{Math.round(v)}</text>
            </g>
          ))}
          {yTickVals.map((v, i) => (
            <g key={`y-${i}`}>
              <line x1={pad} y1={y(v)} x2={baseW - pad} y2={y(v)} stroke="#f2f2f2" strokeWidth={1} />
              <text x={pad - 6} y={y(v)} fontSize={9} textAnchor="end" dominantBaseline="middle" fill="#666">{Math.round(v)}</text>
            </g>
          ))}
        </>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => <circle key={i} cx={x(d[xKey])} cy={y(d[yKey])} r={2} fill={color} />)}
    </svg>
  );
}

function extractAmount(txt: string): number {
  const m = txt.match(/\$([\d,]+)/);
  if (!m) return 0;
  try { return parseInt(m[1].replace(/,/g, ''), 10) || 0; } catch { return 0; }
}

// Players Overview intentionally not rendered inside the dashboard drawer per design
