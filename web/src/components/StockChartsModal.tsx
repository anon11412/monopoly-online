import { useMemo } from 'react';
import { getSocket, getRemembered } from '../lib/socket';
import type { GameSnapshot } from '../types';

type Props = {
  open: boolean;
  snapshot: GameSnapshot;
  onClose: () => void;
  lobbyId: string;
  onOpenStock: (row: any) => void;
};

export default function StockChartsModal({ open, snapshot, onClose, lobbyId, onOpenStock }: Props) {
  const s = getSocket();
  const myName = (getRemembered().displayName || '').trim();
  const stocks = (snapshot as any)?.stocks as Array<any> | undefined;
  const mapByOwner = useMemo(() => {
    const m: Record<string, any> = {};
    (stocks || []).forEach((st) => { m[st.owner] = st; });
    return m;
  }, [stocks]);

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100 }} onClick={onClose}>
  <div className="card" style={{ background: 'var(--color-surface)', width: 'min(900px, 94vw)', maxHeight: '88vh', overflow: 'auto', borderRadius: 10, padding: 14 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>📈 Stock Charts</h3>
          <button className="btn btn-ghost" onClick={onClose}>❌ Close</button>
        </div>
        {!stocks || stocks.length === 0 ? (
          <div className="ui-sm" style={{ opacity: 0.7, marginTop: 8 }}>No stocks yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {stocks.map((st) => (
              <div key={st.owner} className="ui-labelframe">
                <div className="ui-title ui-h3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span title={st.owner} style={{ width: 12, height: 12, borderRadius: '50%', background: st.owner_color || '#999', display: 'inline-block' }} />
                  {st.owner} — ${st.price} • Base {st.base} • Total {st.total_shares}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                  <div style={{ padding: 6 }}>
                    <MiniLineChart history={st.history || []} color={st.owner_color || '#2c3e50'} />
                  </div>
                  <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                    {myName !== st.owner ? (
                      <>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[25, 50, 100].map((amt) => (
                            <button key={amt} className="btn btn-ghost" onClick={() => s.emit('game_action', { id: lobbyId, action: { type: 'stock_invest', owner: st.owner, amount: amt } })}>Buy ${amt}</button>
                          ))}
                        </div>
                        {(() => {
                          const myHolding = (st.holdings || []).find((h: any) => h.investor === myName);
                          if (!myHolding || (myHolding.shares || 0) <= 0) return null;
                          return (
                            <div style={{ display: 'flex', gap: 6 }}>
                              {[25, 50].map((pct) => (
                                <button key={pct} className="btn btn-ghost" onClick={() => s.emit('game_action', { id: lobbyId, action: { type: 'stock_sell', owner: st.owner, percent: pct/100 } })}>Sell {pct}%</button>
                              ))}
                              <button className="btn btn-ghost" onClick={() => s.emit('game_action', { id: lobbyId, action: { type: 'stock_sell', owner: st.owner, amount: 50 } })}>Sell $50</button>
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" onClick={() => onOpenStock(mapByOwner[st.owner])}>Manage</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniLineChart({ history, color }: { history: Array<{ turn: number; pool: number }>, color: string }) {
  const width = 480; const height = 120; const pad = 40; // Increased padding to prevent text cutoff
  const data = history && history.length ? history : [{ turn: 0, pool: 0 }, { turn: 1, pool: 0 }];
  const minTurn = Math.min(...data.map(d => d.turn));
  const maxTurn = Math.max(...data.map(d => d.turn));
  const minPool = Math.min(...data.map(d => d.pool));
  const maxPool = Math.max(...data.map(d => d.pool));
  const xSpan = Math.max(1, maxTurn - minTurn);
  const ySpan = Math.max(1, maxPool - minPool);
  const x = (t: number) => pad + ((t - minTurn) / xSpan) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - minPool) / ySpan) * (height - pad * 2);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.turn)} ${y(d.pool)}`).join(' ');
  const xticks = Math.min(5, xSpan); // Limit ticks to prevent overcrowding
  const yticks = 4;
  const xTickVals = Array.from({ length: xticks + 1 }, (_, i) => Math.round(minTurn + (i / xticks) * xSpan));
  const yTickVals = Array.from({ length: yticks + 1 }, (_, i) => minPool + (i / yticks) * ySpan);
  return (
    <div style={{ width: '100%', maxWidth: '480px', overflow: 'hidden' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* axes */}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
        {/* grid + labels */}
        {xTickVals.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} y1={pad} x2={x(t)} y2={height - pad} stroke="#f5f5f5" strokeWidth={1} />
            <text x={x(t)} y={height - pad + 16} fontSize={9} textAnchor="middle" fill="#666" fontFamily="system-ui">T{t}</text>
          </g>
        ))}
        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={pad} y1={y(v)} x2={width - pad} y2={y(v)} stroke="#f5f5f5" strokeWidth={1} />
            <text x={pad - 6} y={y(v)} fontSize={9} textAnchor="end" dominantBaseline="middle" fill="#666" fontFamily="system-ui">${Math.round(v)}</text>
          </g>
        ))}
        {/* data line */}
        <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* data points */}
        {data.map((d, i) => (
          <circle key={i} cx={x(d.turn)} cy={y(d.pool)} r={3} fill={color} stroke="#fff" strokeWidth={1} />
        ))}
      </svg>
    </div>
  );
}
