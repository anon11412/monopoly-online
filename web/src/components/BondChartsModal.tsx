import { useState, useEffect } from 'react';
import type { GameSnapshot } from '../types';

type Props = {
  open: boolean;
  snapshot: GameSnapshot;
  onClose: () => void;
};

export default function BondChartsModal({ open, snapshot, onClose }: Props) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  if (!open) return null;
  const bonds = (snapshot as any)?.bonds as Array<any> | undefined;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: '10px' }} onClick={onClose}>
      <div className="card" style={{ background: 'var(--color-surface)', width: 'min(900px, 100%)', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', borderRadius: 10, padding: isMobile ? 10 : 14 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: isMobile ? '16px' : '18px' }}>💵 Bond Rate Charts</h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: isMobile ? '12px' : '14px' }}>❌ Close</button>
        </div>
        {!bonds || bonds.length === 0 ? (
          <div className="ui-sm" style={{ opacity: 0.7, marginTop: 8 }}>No bonds yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <div className="ui-labelframe">
              <div className="ui-title ui-h3">All Players</div>
              <div style={{ display: 'grid', gap: 8, padding: 6 }}>
                <CombinedRateChart series={bonds} />
              </div>
            </div>
            {bonds.map((row) => (
              <div key={row.owner} className="ui-labelframe">
                <div className="ui-title ui-h3" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: isMobile ? '14px' : '16px' }}>
                  <span title={row.owner} style={{ width: 12, height: 12, borderRadius: '50%', background: row.owner_color || '#999', display: 'inline-block' }} />
                  {row.owner} — {row.allow_bonds ? `${(row.rate_percent != null ? row.rate_percent : row.rate) || 0}% every ${row.period_turns || 1} turn(s)` : 'disabled'}
                </div>
                <div style={{ padding: 6, overflowX: 'auto' }}>
                  <RateLineChart history={row.history || []} color={row.owner_color || '#2c3e50'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RateLineChart({ history, color }: { history: Array<{ turn: number; rate?: number; rate_percent?: number }>, color: string }) {
  const width = 480; const height = 120; const pad = 40;
  // Normalize: map rate_percent -> rate; synthesize baseline + current extension similar to dashboard logic
  let base = Array.isArray(history) ? history.map(h => ({ ...h, rate: (h as any).rate_percent != null ? (h as any).rate_percent : (h as any).rate })) : [];
  if (base.length === 1) {
    const only = base[0];
    if (only.turn > 0 && !base.some((p:any)=>p.turn===0)) base = [{ turn:0, rate: only.rate }, ...base];
  }
  // We don't have snapshot turns here; attempt extension only if there are at least two points missing continuity? (Skip since modal is static snapshot)
  const data = base.length ? base : [{ turn: 0, rate: 0 }, { turn: 1, rate: 0 }];
  const minTurn = Math.min(...data.map(d => d.turn));
  const maxTurn = Math.max(...data.map(d => d.turn));
  const rawMin = Math.min(...data.map(d => d.rate));
  const rawMax = Math.max(...data.map(d => d.rate));
  let yMin = 0, yMax = 100;
  if (isFinite(rawMin) && isFinite(rawMax)) {
    if (Math.abs(rawMax - rawMin) <= 1.0) {
      const padPct = Math.max(0.05, (rawMax - rawMin) * 0.5 || 0.1);
      yMin = Math.max(0, rawMin - padPct);
      yMax = Math.min(100, rawMax + padPct);
      if (yMin === yMax) { yMin = Math.max(0, yMin - 0.1); yMax = Math.min(100, yMax + 0.1); }
    } else {
      yMin = 0; yMax = 100;
    }
  }
  const xSpan = Math.max(1, maxTurn - minTurn);
  const ySpan = Math.max(0.0001, yMax - yMin);
  const x = (t: number) => pad + ((t - minTurn) / xSpan) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - yMin) / ySpan) * (height - pad * 2);
  const path = data.map((d: any, i: number) => `${i === 0 ? 'M' : 'L'} ${x(d.turn)} ${y(d.rate)}`).join(' ');
  return (
    <div style={{ width: '100%', maxWidth: '480px', overflow: 'hidden' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
        <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d: any, i: number) => (
          <circle key={i} cx={x(d.turn)} cy={y(d.rate)} r={3} fill={color} stroke="#fff" strokeWidth={1} />
        ))}
      </svg>
    </div>
  );
}

function CombinedRateChart({ series }: { series: Array<{ owner: string; owner_color?: string; history?: Array<{ turn: number; rate: number }> }> }) {
  const width = 640; const height = 180; const pad = 40;
  const all = series.flatMap(s => (s.history || []).map(h => ({ turn: h.turn, rate: h.rate })));
  const data = all.length ? all : [{ turn: 0, rate: 0 }, { turn: 1, rate: 0 }];
  const minTurn = Math.min(...data.map(d => d.turn));
  const maxTurn = Math.max(...data.map(d => d.turn));
  const rawMin = Math.min(...data.map(d => d.rate));
  const rawMax = Math.max(...data.map(d => d.rate));
  let yMin = 0, yMax = 100;
  if (isFinite(rawMin) && isFinite(rawMax)) {
    if (Math.abs(rawMax - rawMin) <= 1.0) {
      const padPct = Math.max(0.05, (rawMax - rawMin) * 0.5 || 0.1);
      yMin = Math.max(0, rawMin - padPct);
      yMax = Math.min(100, rawMax + padPct);
      if (yMin === yMax) { yMin = Math.max(0, yMin - 0.1); yMax = Math.min(100, yMax + 0.1); }
    } else {
      yMin = 0; yMax = 100;
    }
  }
  const xSpan = Math.max(1, maxTurn - minTurn);
  const ySpan = Math.max(0.0001, yMax - yMin);
  const x = (t: number) => pad + ((t - minTurn) / xSpan) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - yMin) / ySpan) * (height - pad * 2);
  const palette = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#e84393'];
  return (
    <div style={{ width: '100%', maxWidth: '640px', overflow: 'hidden' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#ccc" strokeWidth={1} />
        {series.map((s, idx) => {
          const hist = (s.history || []).length ? s.history! : [{ turn: 0, rate: 0 }, { turn: 1, rate: 0 }];
          const d = hist.map((h: any, i: number) => `${i === 0 ? 'M' : 'L'} ${x(h.turn)} ${y(h.rate)}`).join(' ');
          const color = s.owner_color || palette[idx % palette.length];
          return <path key={s.owner} d={d} fill="none" stroke={color} strokeWidth={2} />;
        })}
      </svg>
    </div>
  );
}

