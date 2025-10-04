import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { LineChart as RCLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RCPieChart, Pie, Cell } from 'recharts';
import type { GameSnapshot } from '../types';
import { getSocket, getRemembered } from '../lib/socket';
import { normalizeName, equalNames } from '../lib/names';
import { useAutoScroll } from '../hooks/useAutoScroll';
import ChatPanel from './ChatPanel';

type Props = {
  open: boolean;
  onClose: () => void;
  lobbyId: string;
  snapshot: GameSnapshot;
};

export default function DashboardModal({ open, onClose, lobbyId, snapshot }: Props) {
  const [tab, setTab] = useState<'home' | 'charts' | 'stocks' | 'bonds' | 'payments'>('home');
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches;
  });
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, []);

  if (!open) return null;
  const panelWidth = isMobile ? '100vw' : 'min(1200px, 96vw)';
  const tabs: { key: typeof tab; label: string; title?: string }[] = [
    { key: 'home', label: 'Home', title: 'Dashboard Home' },
    { key: 'charts', label: 'Charts', title: 'Analytics & KPIs' },
    { key: 'stocks', label: 'Stocks', title: 'Stock Details' },
    { key: 'bonds', label: 'Bonds', title: 'Bond Details' },
    { key: 'payments', label: 'Payments', title: 'Recurring & Rentals' }
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 3000 }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: isMobile ? '0vh' : '4vh',
          left: isMobile ? '50%' : '50%',
          transform: isMobile ? 'translateX(-50%) scale(1.8)' : 'translateX(-50%)',
          transformOrigin: isMobile ? 'center top' : 'center',
          width: panelWidth,
          height: isMobile ? '100vh' : 'auto',
          maxHeight: isMobile ? '100vh' : '92vh',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: isMobile ? 'none' : '1px solid var(--color-border)',
          borderRadius: isMobile ? 0 : 10,
          padding: isMobile ? 16 : 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: isMobile ? 'none' : 'var(--elev-4)'
        }}
      >
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          marginBottom: 8, 
          gap: 12,
          position: isMobile ? 'sticky' : 'static',
          top: 0,
          zIndex: 10,
          background: 'var(--color-surface)',
          padding: isMobile ? '4px 0' : '0'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: isMobile ? 2 : 8, 
            flex: 1, 
            overflowX: 'visible',
            paddingRight: 0,
            justifyContent: isMobile ? 'space-between' : 'flex-start'
          }}>
            {tabs.map(t => (
              <button
                key={t.key}
                className="btn btn-ghost"
                title={t.title}
                onClick={() => setTab(t.key)}
                style={{
                  padding: isMobile ? '4px 6px' : '4px 10px',
                  fontSize: isMobile ? 10 : 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: isMobile ? 1 : 0,
                  border: tab === t.key ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                  background: tab === t.key ? 'var(--color-accent)' : 'var(--color-surface-alt, transparent)',
                  color: tab === t.key ? 'white' : 'var(--color-text)',
                  borderRadius: 6,
                  boxShadow: tab === t.key ? '0 0 0 2px rgba(0,0,0,0.15) inset' : 'none',
                  minHeight: isMobile ? '28px' : 'auto',
                  minWidth: isMobile ? '0' : 'auto',
                  maxWidth: isMobile ? '18%' : 'auto'
                }}
              >
                {isMobile ? (t.key === 'home' ? 'Home' : t.key === 'charts' ? 'Charts' : t.key === 'stocks' ? 'Stocks' : t.key === 'bonds' ? 'Bonds' : 'Pay') : t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="ui-h3" style={{ margin: 0, display: 'none' }}>📊 Dashboard</div>
            <button 
              className="btn" 
              onClick={onClose}
              style={{ 
                minHeight: isMobile ? '36px' : 'auto',
                padding: isMobile ? '6px 12px' : '8px 16px',
                fontSize: isMobile ? 12 : 14
              }}
            >
              Close
            </button>
          </div>
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: isMobile ? 'auto' : 'hidden' }}>
          {tab === 'home' && (
            <div style={{ display: 'grid', gap: 8, overflow: isMobile ? 'visible' : 'hidden', paddingBottom: 8, minHeight: 0, height: isMobile ? 'auto' : '100%' }}>
              <DashboardGrid lobbyId={lobbyId} snapshot={snapshot} isMobile={isMobile} />
            </div>
          )}
          {tab === 'charts' && (
            <div style={{ height: '100%', overflow: isMobile ? 'auto' : 'hidden' }}>
              <ChartsDashboardPage snapshot={snapshot} isMobile={isMobile} />
            </div>
          )}
          {tab === 'stocks' && (
            <StocksOnlyPage snapshot={snapshot} lobbyId={lobbyId} isMobile={isMobile} />
          )}
          {tab === 'bonds' && (
            <BondsOnlyPage snapshot={snapshot} lobbyId={lobbyId} isMobile={isMobile} />
          )}
          {tab === 'payments' && (
            <PaymentsPage snapshot={snapshot} isMobile={isMobile} />
          )}
        </div>
      </div>
    </div>
  );
}

/* Charts page as specified: top row 5 tall narrow boxes, bottom row 4 wider/square boxes. */
function ChartsDashboardPage({ snapshot, isMobile }: { snapshot: any; isMobile: boolean }) {
  const snap = (window as any).__latestSnapshot || snapshot || {};
  const players: Array<{ name: string; cash: number }> = Array.isArray(snap.players) ? snap.players : [];
  const stats = snap.stats || {};
  const statsPlayers: any[] = Array.isArray(stats.players) ? stats.players : [];
  const history: any[] = Array.isArray(stats.history) ? stats.history : [];
  // One-time debug to verify why charts might not show (height or empty data)
  if (typeof window !== 'undefined' && !(window as any).__charts_debug_logged) {
    (window as any).__charts_debug_logged = true;
    // eslint-disable-next-line no-console
    console.debug('[ChartsDashboardPage] snapshot players=%d statsPlayers=%d hasStats=%s', players.length, statsPlayers.length, !!snap.stats);
  }
  // Fallback derivations only if server stats absent
  let avgRollSeries: any[] = [];
  let spendingMap = new Map<string, number>();
  let earningsMap = new Map<string, number>();
  if (statsPlayers.length) {
    avgRollSeries = statsPlayers.map(p => ({ player: p.name, avg: p.avg_roll }));
  } else {
    const diceRollEvents = (snap.log || []).filter((e: any) => /rolled/i.test(e.type || e.text || ''));
    const perPlayer = new Map<string, { rolls: number; sum: number }>();
    diceRollEvents.forEach((e: any) => {
      const txt = String(e.text || '');
      const m = txt.match(/^(.*?)\s+rolled\s+(?:a\s+)?(\d+)/i);
      if (m) {
        const name = m[1].trim();
        const val = parseInt(m[2], 10);
        if (!perPlayer.has(name)) perPlayer.set(name, { rolls: 0, sum: 0 });
        const rec = perPlayer.get(name)!; rec.rolls += 1; rec.sum += val;
      }
    });
    avgRollSeries = players.map(p => ({ player: p.name, avg: (perPlayer.get(p.name)?.sum || 0) / Math.max(1, perPlayer.get(p.name)?.rolls || 1) }));
  }
  if (statsPlayers.length) {
    spendingMap = new Map(statsPlayers.map(p => [p.name.toLowerCase(), p.spending_total]));
    earningsMap = new Map(statsPlayers.map(p => [p.name.toLowerCase(), p.earnings_total]));
  } else {
    const ledger: any[] = Array.isArray(snap.ledger) ? snap.ledger : [];
    ledger.forEach(e => {
      const from = String(e.from || '').toLowerCase();
      const to = String(e.to || '').toLowerCase();
      const amt = Number(e.amount || 0);
      if (!amt) return;
      if (from && amt > 0) spendingMap.set(from, (spendingMap.get(from) || 0) + amt);
      if (to && amt > 0) earningsMap.set(to, (earningsMap.get(to) || 0) + amt);
    });
  }
  // Market/net worth series: prefer net_worth from stats
  const marketSeries = statsPlayers.length
    ? statsPlayers.map(p => ({ player: p.name, value: p.net_worth }))
    : players.map(p => ({ player: p.name, value: p.cash }));
  // Stock pool history per owner (pool from stock.history where available)
  const stocks: any[] = Array.isArray(snap.stocks) ? snap.stocks : [];
  const stockOwners = Array.from(new Set(stocks.map(s => s.owner))).filter(Boolean);
  const stockHistoryRows = (() => {
    // Build map owner -> [{turn,pool}]
    const byOwner: Record<string, Array<{ turn: number; pool: number }>> = {};
    for (const st of stocks) {
      const owner = st.owner;
      if (!owner) continue;
      const hist: Array<{ turn: number; pool: number }> = Array.isArray(st.history) ? st.history : [];
      byOwner[owner] = hist.map((h: { turn: number; pool: number }) => ({ turn: h.turn, pool: h.pool }));
    }
    // Merge turns
    const allTurns = Array.from(new Set(Object.values(byOwner).flat().map(r => r.turn))).sort((a,b)=>a-b);
    return allTurns.map(turn => {
      const row: any = { turn };
      for (const owner of stockOwners) {
        const match = (byOwner[owner]||[]).find(r => r.turn === turn);
        if (match) row[owner] = match.pool; // leave undefined if no data yet
      }
      return row;
    });
  })();
  // Bonds rate history per owner (normalize rate_percent -> rate, synthesize baseline & current extension)
  const bonds: any[] = Array.isArray(snap.bonds) ? snap.bonds : [];
  const bondOwners = Array.from(new Set(bonds.map(b => b.owner))).filter(Boolean);
  const bondHistoryRows = (() => {
    const byOwner: Record<string, Array<{ turn: number; rate: number }>> = {};
    const gameTurn = Number(snap.turns || snap.current_turn || 0);
    for (const b of bonds) {
      const owner = b.owner; if (!owner) continue;
      const rawHist: Array<any> = Array.isArray(b.history) ? b.history : [];
      let norm = rawHist.map(h => ({ turn: h.turn, rate: (h.rate_percent != null) ? h.rate_percent : h.rate }));
      if (norm.length === 1) {
        const only = norm[0];
        if (only.turn > 0 && !norm.some(p=>p.turn===0)) norm = [{ turn:0, rate: only.rate }, ...norm];
      }
      const last = norm[norm.length-1];
      if (last && gameTurn > last.turn) {
        norm = [...norm, { turn: gameTurn, rate: last.rate }];
      }
      byOwner[owner] = norm;
    }
    if (!bondOwners.length) return [] as any[];
    // Determine unified turn range from 0 (if any series starts later, we still start at its first turn) to gameTurn
    let minTurn = Infinity; let maxTurn = -Infinity;
    for (const owner of bondOwners) {
      const arr = byOwner[owner] || [];
      for (const rec of arr) { if (rec.turn < minTurn) minTurn = rec.turn; if (rec.turn > maxTurn) maxTurn = rec.turn; }
    }
    if (!isFinite(minTurn)) minTurn = 0;
    if (!isFinite(maxTurn)) maxTurn = gameTurn;
    maxTurn = Math.max(maxTurn, gameTurn);
    const rows: any[] = [];
    const lastRates: Record<string, number> = {};
    for (let t = minTurn; t <= maxTurn; t++) {
      const row: any = { turn: t };
      for (const owner of bondOwners) {
        const arr = byOwner[owner] || [];
        const exact = arr.find(r => r.turn === t);
        if (exact) {
          lastRates[owner] = exact.rate;
          row[owner] = exact.rate;
        } else if (lastRates[owner] != null) {
          row[owner] = lastRates[owner];
        }
      }
      rows.push(row);
    }
    return rows;
  })();
  // (Old rent group heuristic removed in favor of per-player rent_potential chart)
  // Colors palette reuse
  // Palette reserved for future multi-series time charts (not yet used in snapshot bars)
  // Utility component: multi-line chart builder for per-player single snapshot metric (use BarChart instead of line for single point)
  const palette = ['#2980b9','#27ae60','#8e44ad','#e67e22','#c0392b','#16a085','#2c3e50','#7f8c8d'];
  // Build name->color from snapshot players (authoritative assignment)
  const playerColorMap: Record<string,string> = {};
  for (const p of (snap.players||[])) {
    if (p?.name && p?.color) playerColorMap[p.name] = p.color;
  }
  const byPlayerColor = (name: string, idx: number) => playerColorMap[name] || palette[idx % palette.length];

  // New stable mobile chart component
  const StableMobileChart = ({ metric, isMobile }: { metric: 'avg_roll' | 'net_worth' | 'spending_total' | 'earnings_total'; isMobile: boolean }) => {
    // Use history if available, otherwise create a single data point from current stats
    let chartHistory = history;
    if (!history.length && statsPlayers.length) {
      // Create synthetic history from current stats
      chartHistory = [{
        turn: 0,
        players: statsPlayers.map(p => ({
          name: p.name,
          avg_roll: p.avg_roll,
          net_worth: p.net_worth,
          spending_total: p.spending_total,
          earnings_total: p.earnings_total
        }))
      }];
    }
    
    if (!chartHistory.length) return <Placeholder msg="Waiting for data" />;
    
    const seriesNames = Array.from(new Set(chartHistory.flatMap(h => (h.players||[]).map((p:any)=>p.name))));
    const rows = chartHistory.map(h => {
      const row: any = { turn: h.turn };
      for (const p of h.players || []) {
        row[p.name] = p[metric];
      }
      return row;
    });

    if (isMobile) {
      // Mobile: Fixed size chart without ResponsiveContainer
      return (
        <div style={{ width: '100%', height: '200px', position: 'relative' }}>
          <RCLineChart width={300} height={200} data={rows} margin={{ top:6, right: 12, left: 8, bottom:4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
            <XAxis dataKey="turn" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={50} />
            <Tooltip animationDuration={0} />
            {seriesNames.map((name, idx) => (
              <Line key={name} type="monotone" dataKey={name} stroke={byPlayerColor(name, idx)} strokeWidth={3} dot={false} animationDuration={0} isAnimationActive={false} />
            ))}
          </RCLineChart>
        </div>
      );
    }

    // Desktop: Keep original responsive behavior
    return (
      <div style={{ position:'absolute', inset:0 }}>
        <ResponsiveContainer width="100%" height="100%" debounce={500}>
          <RCLineChart data={rows} margin={{ top:6, right: 8, left: 4, bottom:4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
            <XAxis dataKey="turn" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={42} />
            <Tooltip animationDuration={0} />
            {seriesNames.map((name, idx) => (
              <Line key={name} type="monotone" dataKey={name} stroke={byPlayerColor(name, idx)} strokeWidth={2} dot={false} animationDuration={0} isAnimationActive={false} />
            ))}
          </RCLineChart>
        </ResponsiveContainer>
      </div>
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, flexShrink: 0 }}>Dashboard charts Screen.</div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 30, overflowY: 'auto', paddingBottom: isMobile ? 20 : 0 }}>
  {(!avgRollSeries.length && !marketSeries.length && !stocks.length && !bonds.length && !history.length && !statsPlayers.length) && (
          <div style={{ padding: '8px 10px', background: 'var(--color-surface-alt, #222)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12, lineHeight: 1.4 }}>
            No chart data yet.<br />
            Possible reasons:
            <ul style={{ margin: '4px 0 0 14px', padding: 0 }}>
              <li>No turns have been taken (roll the dice to generate logs).</li>
              <li>No financial transactions yet (spending/earnings appear after property buys, rent, taxes, trades).</li>
              <li>Waiting on server snapshot: if this persists more than a few seconds, reconnect.</li>
            </ul>
          </div>
        )}
        {/* Top Row (5) */}
        <div className="charts-row charts-row-top">
          {/* 1 Avg Roll */}
          <ChartTile title="Avg Roll (trend)" isMobile={isMobile}>
            {(statsPlayers.length || history.length) ? <StableMobileChart metric="avg_roll" isMobile={isMobile} /> : <Placeholder msg="No data yet" />}
          </ChartTile>
          {/* 2 Stock Pool Trend */}
          <ChartTile title="Stock Pool (trend)" isMobile={isMobile}>
            {stockOwners.length && stockHistoryRows.length > 1 ? (
              <div style={{ position:'absolute', inset:0 }}>
                <ResponsiveContainer width="100%" height="100%" debounce={500}>
                  <RCLineChart data={stockHistoryRows} margin={{ top:6, right: isMobile ? 12 : 8, left: isMobile ? 8 : 4, bottom:4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                    <XAxis dataKey="turn" tick={{ fontSize: isMobile ? 12 : 10 }} />
                    <YAxis tick={{ fontSize: isMobile ? 12 : 10 }} width={isMobile ? 50 : 42} />
                    <Tooltip animationDuration={0} />
                    {stockOwners.map((o, idx) => (
                      <Line key={o} type="monotone" dataKey={o} stroke={byPlayerColor(o, idx)} strokeWidth={isMobile ? 3 : 2} dot={false} animationDuration={0} isAnimationActive={false} />
                    ))}
                  </RCLineChart>
                </ResponsiveContainer>
              </div>
            ) : (stockOwners.length ? <Placeholder msg="Waiting for history" /> : <Placeholder msg="No stocks" />)}
          </ChartTile>
          {/* 3 Market Value */}
          <ChartTile title="Net Worth (trend)" isMobile={isMobile}>
            {(statsPlayers.length || history.length) ? <StableMobileChart metric="net_worth" isMobile={isMobile} /> : <Placeholder msg="No players" />}
          </ChartTile>
          {/* 4 Spending */}
          <ChartTile title="Spending (trend)" isMobile={isMobile}>
            {(statsPlayers.length || history.length) ? <StableMobileChart metric="spending_total" isMobile={isMobile} /> : <Placeholder msg="No data" />}
          </ChartTile>
          {/* 5 Earnings */}
          <ChartTile title="Earnings (trend)" isMobile={isMobile}>
            {(statsPlayers.length || history.length) ? <StableMobileChart metric="earnings_total" isMobile={isMobile} /> : <Placeholder msg="No data" />}
          </ChartTile>
        </div>
        {/* Bottom Row (4) */}
        <div className="charts-row charts-row-bottom">
          {/* 6 Bonds */}
          <ChartTile title="Bonds Rate (trend)" isMobile={isMobile}>
            {bondOwners.length && bondHistoryRows.length > 1 ? (
              <div style={{ position:'absolute', inset:0 }}>
                <ResponsiveContainer width="100%" height="100%" debounce={500}>
                  <RCLineChart data={bondHistoryRows} margin={{ top:6, right: isMobile ? 12 : 8, left: isMobile ? 8 : 4, bottom:4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                    <XAxis dataKey="turn" tick={{ fontSize: isMobile ? 12 : 10 }} />
                    <YAxis tick={{ fontSize: isMobile ? 12 : 10 }} width={isMobile ? 50 : 42} />
                    <Tooltip animationDuration={0} />
                    {bondOwners.map((o, idx) => (
                      <Line key={o} type="monotone" dataKey={o} stroke={byPlayerColor(o, idx+3)} strokeWidth={isMobile ? 3 : 2} dot={false} animationDuration={0} isAnimationActive={false} />
                    ))}
                  </RCLineChart>
                </ResponsiveContainer>
              </div>
            ) : (bondOwners.length ? <Placeholder msg="Waiting for history" /> : <Placeholder msg="No bonds" />)}
          </ChartTile>
          {/* 7 Rent Potential per Player */}
          <ChartTile title="Rent Potential (trend)" isMobile={isMobile}>
            {(history.length > 1 || (statsPlayers.length && statsPlayers.some(p => p.rent_potential > 0))) ? (
              (() => {
                // Use history if available, otherwise create from current stats
                let chartData = history;
                if (!history.length && statsPlayers.length) {
                  chartData = [{
                    turn: 0,
                    players: statsPlayers.map(p => ({
                      name: p.name,
                      rent_potential: p.rent_potential || 0
                    }))
                  }];
                }
                
                if (!chartData.length) return <Placeholder msg="No rent data" />;
                
                // Build rows with rent_potential per player name
                const playerNames = Array.from(new Set(chartData.flatMap(h => (h.players||[]).map((p:any)=>p.name))));
                const rows = chartData.map(h => {
                  const row: any = { turn: h.turn };
                  for (const p of (h.players||[])) {
                    if (typeof p.rent_potential === 'number') row[p.name] = p.rent_potential;
                  }
                  return row;
                });
                const hasAny = rows.some(r => playerNames.some(n => typeof r[n] === 'number'));
                if (!hasAny) return <Placeholder msg="No rent data" />;
                return (
                  <div style={{ position:'absolute', inset:0 }}>
                    <ResponsiveContainer width="100%" height="100%" debounce={500}>
                      <RCLineChart data={rows} margin={{ top:6, right: isMobile ? 12 : 8, left: isMobile ? 8 : 4, bottom:4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                        <XAxis dataKey="turn" tick={{ fontSize: isMobile ? 12 : 10 }} />
                        <YAxis tick={{ fontSize: isMobile ? 12 : 10 }} width={isMobile ? 50 : 42} />
                        <Tooltip animationDuration={0} />
                        {playerNames.map((n, idx) => (
                          <Line key={n} type="monotone" dataKey={n} stroke={byPlayerColor(n, idx+5)} strokeWidth={isMobile ? 3 : 2} dot={false} animationDuration={0} isAnimationActive={false} />
                        ))}
                      </RCLineChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()
            ) : <Placeholder msg="No rent data" />}
          </ChartTile>
          {/* 8 Reserved */}
          <ChartTile title="Reserved" isMobile={isMobile}>
            <Placeholder msg="Add chart later" />
          </ChartTile>
          {/* 9 Reserved */}
          <ChartTile title="Reserved" isMobile={isMobile}>
            <Placeholder msg="Add chart later" />
          </ChartTile>
        </div>
      </div>
      <style>{`
        .charts-row { 
          display: ${isMobile ? 'block' : 'flex'}; 
          gap: ${isMobile ? '0' : '2%'}; 
          flex: ${isMobile ? 'none' : '1 1 0'}; 
          min-height: ${isMobile ? 'auto' : '280px'}; 
          height: ${isMobile ? 'auto' : '100%'};
          overflow: ${isMobile ? 'visible' : 'hidden'};
        }
        
        ${isMobile ? `
                .charts-row > div {
                  width: 100% !important;
                  margin-bottom: 16px !important;
                }
                ` : ''}
        .charts-row-top { flex: ${isMobile ? 'none' : '1 1 0'}; }
        .charts-row-bottom { flex: ${isMobile ? 'none' : '1 1 0'}; }
        .charts-row-top > *, .charts-row-bottom > * { 
          flex: ${isMobile ? 'none' : '1'}; 
          min-width: 0; 
          display: flex; 
          min-height: ${isMobile ? 'auto' : '280px'};
          height: ${isMobile ? '220px' : 'auto'};
          margin-bottom: ${isMobile ? '12px' : '0'};
        }
        .charts-row .ui-labelframe { 
          width: 100%; 
          height: 100%;
          overflow: hidden;
        }
        /* Responsive stacking for larger screens */
        @media (min-width: 769px) and (max-width: 1100px) { 
          .charts-row { flex-wrap: wrap; } 
          .charts-row > * { flex: 1 1 calc(50% - 1%); min-height: 260px; } 
        }
        /* Mobile always uses column layout via inline styles */
      `}</style>
    </div>
  );
}

function ChartTile({ title, children, isMobile }: { title: string; children: React.ReactNode; isMobile: boolean }) {
  const frameStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    padding: 8,
    overflow: 'hidden',
    height: isMobile ? 236 : '100%'
  };

  return (
    <div className="ui-labelframe" style={frameStyle}>
      <div style={{ fontSize:12, fontWeight:700, marginBottom:6, flexShrink:0 }}>{title}</div>
      <div style={{ flex: isMobile ? 'none' : 1, minHeight: 200, height: isMobile ? 200 : '100%', position:'relative' }}>{children}</div>
    </div>
  );
}
function Placeholder({ msg }: { msg: string }) { return <div style={{ position:'absolute', inset:0, border:'1px dashed var(--color-border)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, opacity:0.7 }}>{msg}</div>; }

/* Stocks only page */
function StocksOnlyPage({ snapshot, lobbyId, isMobile }: { snapshot: GameSnapshot; lobbyId: string; isMobile: boolean }) {
  const rawStocks = (((window as any).__latestSnapshot || snapshot)?.stocks as any[] | undefined) || [];
  // Deduplicate by owner (server already should, but be defensive)
  const stockMap = new Map<string, any>();
  for (const st of rawStocks) { const key = (st?.owner || '').toLowerCase(); if (key && !stockMap.has(key)) stockMap.set(key, st); }
  const stocks = Array.from(stockMap.values());
  // No selection state needed after refactor
  const myName = (getRemembered().displayName || '').trim();

  // Player color mapping for consistent segment colors
  const playerColorMap: Record<string,string> = {};
  for (const p of (snapshot.players||[])) { if (p?.name && p?.color) playerColorMap[p.name] = p.color; }
  const palette = ['#2980b9','#27ae60','#8e44ad','#e67e22','#c0392b','#16a085','#2c3e50','#7f8c8d'];
  const colorFor = (name: string, idx: number) => playerColorMap[name] || palette[idx % palette.length];

  // Consolidated stock pool trend (same logic as Charts page Stock Pool (trend))
  const stockOwners = useMemo(() => Array.from(new Set(stocks.map(s => s.owner))).filter(Boolean), [stocks]);
  const stockHistoryRows = useMemo(() => {
    if (!stockOwners.length) return [] as any[];
    // Build map owner -> history entries (turn,pool)
    const byOwner: Record<string, Array<{ turn:number; pool:number }>> = {};
    for (const st of stocks) {
      const owner = st.owner; if (!owner) continue;
      const hist: Array<{ turn:number; pool:number }> = Array.isArray(st.history) ? st.history : [];
      byOwner[owner] = hist.map(h => ({ turn: h.turn, pool: h.pool }));
    }
    const allTurns = Array.from(new Set(Object.values(byOwner).flat().map(r => r.turn))).sort((a,b)=>a-b);
    return allTurns.map(turn => {
      const row: any = { turn };
      for (const owner of stockOwners) {
        const match = (byOwner[owner]||[]).find(r => r.turn === turn);
        if (match) row[owner] = match.pool;
      }
      return row;
    });
  }, [stocks, stockOwners]);
  // Per-stock ownership donut data builder
  const buildDonutData = (row: any) => {
    if (!row) return [] as Array<{ name:string; value:number }>;
    const arr: Array<{ name:string; value:number }> = [];
    const ownerPercent = (row.owner_percent ?? 0) * 100;
    arr.push({ name: row.owner, value: ownerPercent });
    for (const h of (row.holdings||[])) {
      const pct = (h.percent || 0) * 100; if (pct > 0.001) arr.push({ name: h.investor, value: pct });
    }
    const total = arr.reduce((s,v)=>s+v.value,0);
    if (total > 0 && Math.abs(total - 100) > 0.01) arr[arr.length-1].value += (100 - total);
    return arr.filter(d => d.value > 0.001);
  };

  // Local modal state for two-phase invest/sell flows (preview + confirm)
  const [showInvest, setShowInvest] = useState<null | { owner: string }>(null);
  const [showSell, setShowSell] = useState<null | { owner: string }>(null);
  const [showStockSettings, setShowStockSettings] = useState<null | { owner: string }>(null);

  return (
    <div style={{ display:'flex', flexDirection:'column', height: isMobile ? 'auto' : '100%', minHeight:0, overflow: isMobile ? 'visible' : 'hidden' }}>
      <div style={{ fontSize:18, fontWeight:700, marginBottom:12 }}>Stocks</div>
      <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow: isMobile ? 'visible' : 'hidden' }}>
        {/* Top consolidated chart */}
        <div style={{ minWidth:0, display:'flex', flexDirection:'column', minHeight:0 }}>
          <div style={{ border:'1px solid var(--color-border)', borderRadius:10, padding:10, marginBottom:12, background:'var(--color-surface-alt,#181818)', height:200, display:'flex', flexDirection:'column' }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>Stock Pool (trend)</div>
            <div style={{ flex:1, minHeight:0 }}>
              {stockOwners.length && stockHistoryRows.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RCLineChart data={stockHistoryRows} margin={{ top:6,right:8,left:4,bottom:4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="turn" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={42} />
                    <Tooltip animationDuration={0} />
                    {stockOwners.map((o, idx) => (
                      <Line key={o} type="monotone" dataKey={o} stroke={colorFor(o, idx)} strokeWidth={2} dot={false} animationDuration={0} isAnimationActive={false} />
                    ))}
                  </RCLineChart>
                </ResponsiveContainer>
              ) : (stockOwners.length ? <Placeholder msg="Waiting for history" /> : <Placeholder msg="No stocks" />)}
            </div>
          </div>
          <div style={{ minWidth:0, overflowY:'auto', display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(260px,1fr))', gridAutoRows: isMobile ? 'minmax(400px,1fr)' : 'minmax(300px,1fr)', gap: isMobile ? 16 : 12, alignContent:'start', flex:1 }}>
            {stocks.map((row: any, i: number) => {
              const donut = buildDonutData(row);
              // Determine rule values with fallbacks (support legacy enforce_min_pool flag)
              const enforceMinPoolTotal = row.enforce_min_pool_total ?? row.enforce_min_pool ?? false;
              const enforceMinPoolOwner = row.enforce_min_pool_owner ?? row.enforce_min_pool ?? false;
              // Show numeric thresholds even if enforcement flags are OFF (0 is valid)
              const minBuyVal = (row.min_buy ?? row.min_buy === 0) ? row.min_buy : null;
              const minPoolTotalVal = (row.min_pool_total ?? row.min_pool_total === 0) ? row.min_pool_total : null;
              const minPoolOwnerVal = (row.min_pool_owner ?? row.min_pool_owner === 0) ? row.min_pool_owner : null;
              const isMine = !!myName && row?.owner && equalNames(row.owner, myName);
              const myHolding = (row?.holdings || []).find((h: any) => myName && equalNames(h.investor, myName));
              return (
                <div
                  key={row.owner || i}
                  className="stock-card"
                  style={{
                    textAlign:'left',
                    border: '1px solid var(--color-border)',
                    borderRadius:10,
                    padding:10,
                    display:'flex', flexDirection:'column', minHeight:0,
                    background: 'var(--color-surface)'
                  }}
                >
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:10, height:10, borderRadius:'50%', background: colorFor(row.owner, i), display:'inline-block' }} />
                    {normalizeName(row.owner)}
                  </div>
                  <div style={{ fontSize:11, opacity:0.8, marginBottom:4 }}>Pool: ${Number(row.price||0).toLocaleString()}</div>
                  <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', gap:4 }}>
                    <div style={{ flex:'0 0 140px', position:'relative', overflow:'hidden' }}>
                      {donut.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <RCPieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                            <Pie data={donut} dataKey="value" nameKey="name" innerRadius={40} outerRadius={58} paddingAngle={1} minAngle={2} isAnimationActive={false}>
                              {donut.map((seg, idx2) => (
                                <Cell key={seg.name} fill={colorFor(seg.name, idx2)} stroke="#111" strokeWidth={1} />
                              ))}
                            </Pie>
                          </RCPieChart>
                        </ResponsiveContainer>
                      ) : <Placeholder msg="No ownership" />}
                    </div>
                    {donut.length ? (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, justifyContent:'center', background:'rgba(0,0,0,0.35)', padding:'3px 6px', borderRadius:6 }}>
                        {donut.map((seg, idx2) => (
                          <div key={seg.name} style={{ display:'flex', alignItems:'center', gap:4, fontSize:9, lineHeight:1 }}>
                            <span style={{ width:8, height:8, background: colorFor(seg.name, idx2), display:'inline-block', borderRadius:2 }} />
                            <span style={{ whiteSpace:'nowrap' }}>{normalizeName(seg.name)} {seg.value.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ fontSize:10, marginTop:6, lineHeight:1.3, display:'flex', alignItems:'stretch', gap:8 }}>
                    <div style={{ display:'grid', gap:4, flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <span
                          title={row.allow_investing ? 'Owner currently allows new investments into this stock.' : 'Owner has disabled new investments into this stock.'}
                          style={{ background: row.allow_investing ? '#2d5a2d' : '#5a2d2d', padding:'2px 6px', borderRadius:4, fontWeight:600 }}
                        >{row.allow_investing ? 'Investing ON' : 'Investing OFF'}</span>
                        <span
                          title={'Minimum single investment amount. Displayed even if enforcement is off. If (off), the threshold is shown for reference only.'}
                          style={{ background:'#333', padding:'2px 6px', borderRadius:4 }}
                        >Min Buy: {minBuyVal != null ? minBuyVal : '—'}{!row.enforce_min_buy && minBuyVal != null ? ' (off)' : ''}</span>
                        <span
                          title={'Minimum total pool size required AFTER your investment. If (off), it will not block investing.'}
                          style={{ background:'#333', padding:'2px 6px', borderRadius:4 }}
                        >Min Pool Total: {minPoolTotalVal != null ? minPoolTotalVal : '—'}{!enforceMinPoolTotal && minPoolTotalVal != null ? ' (off)' : ''}</span>
                        <span
                          title={'Minimum ownership percentage the OWNER must retain after your investment. If (off), it is informational only.'}
                          style={{ background:'#333', padding:'2px 6px', borderRadius:4 }}
                        >Min Owner Stake: {minPoolOwnerVal != null ? minPoolOwnerVal : '—'}{!enforceMinPoolOwner && minPoolOwnerVal != null ? ' (off)' : ''}</span>
                      </div>
                      {(!row.enforce_min_buy && !enforceMinPoolTotal && !enforceMinPoolOwner) && (
                        <div style={{ opacity:0.6 }}>No restrictions set.</div>
                      )}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:4, justifyContent:'flex-start' }}>
                      {isMine ? (
                        <button className="btn btn-ghost" style={{ padding:'2px 8px', fontSize:11 }} onClick={() => setShowStockSettings({ owner: row.owner })}>Settings</button>
                      ) : (
                        <>
                          {row.allow_investing ? (
                            <button className="btn btn-ghost" style={{ padding:'2px 8px', fontSize:11 }} onClick={() => setShowInvest({ owner: row.owner })}>Invest</button>
                          ) : (
                            <span className="ui-xs" style={{ opacity:0.6 }}>No Invest</span>
                          )}
                          {(myHolding && myHolding.shares > 0) ? (
                            <button className="btn btn-ghost" style={{ padding:'2px 8px', fontSize:11 }} onClick={() => setShowSell({ owner: row.owner })}>Sell</button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {stocks.length === 0 ? <div style={{ opacity:0.6 }}>No stocks yet.</div> : null}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 1050px) {
          /* Responsive: stack panels */
          .stock-detail-responsive { display:flex; flex-direction:column; }
        }
      `}</style>
      {/* Two-phase Invest/Sell Modals for Stocks page */}
      {showInvest ? (
        <StockTwoPhaseInvestModal
          owner={showInvest.owner}
          snapshot={snapshot}
          lobbyId={lobbyId}
          onClose={() => setShowInvest(null)}
        />
      ) : null}
      {showSell ? (
        <StockTwoPhaseSellModal
          owner={showSell.owner}
            snapshot={snapshot}
            lobbyId={lobbyId}
            onClose={() => setShowSell(null)}
        />
      ) : null}
      {showStockSettings ? (
        <StockSettingsModal
          onClose={() => setShowStockSettings(null)}
          lobbyId={lobbyId}
          snapshot={snapshot}
          owner={showStockSettings.owner}
        />
      ) : null}
    </div>
  );
}

/* Bonds only page */
function BondsOnlyPage({ snapshot, lobbyId, isMobile }: { snapshot: GameSnapshot; lobbyId: string; isMobile: boolean }) {
  const rawBonds = (((window as any).__latestSnapshot || snapshot)?.bonds as any[]) || [];
  const map = new Map<string, any>();
  for (const b of rawBonds) { const key = (b?.owner || '').toLowerCase(); if (key && !map.has(key)) map.set(key, b); }
  const bonds = Array.from(map.values());
  const myName = (getRemembered().displayName || '').trim();
  const [showBondInvestLocal, setShowBondInvestLocal] = useState<null | { owner: string }>(null);
  const [showBondSettingsLocal, setShowBondSettingsLocal] = useState<null | { owner: string }>(null);
  const playerColorMap: Record<string,string> = {};
  for (const p of (snapshot.players||[])) { if (p?.name && p?.color) playerColorMap[p.name] = p.color; }
  const colorFor = (name: string, idx: number) => playerColorMap[name] || ['#2980b9','#27ae60','#8e44ad','#e67e22','#c0392b','#16a085'][idx % 6];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Bonds</div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: isMobile ? 16 : 12 }}>
        {bonds.map((row: any, i: number) => {
          const isMine = row?.owner && myName && equalNames(row.owner, myName);
          return (
            <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background: colorFor(row.owner, i), display:'inline-block' }} />
                {normalizeName(row.owner)}
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {row?.history && row.history.length ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <RCLineChart data={(function(){
                      const raw = Array.isArray(row.history) ? row.history : [];
                      let norm = raw.map((h:any)=>({ ...h, rate: (h.rate_percent != null) ? h.rate_percent : h.rate }));
                      if (norm.length === 1) {
                        const only = norm[0];
                        const curTurn = Number(only.turn)||0;
                        if (curTurn > 0 && !norm.some((p:any)=>p.turn===0)) norm = [{ turn:0, rate: only.rate }, ...norm];
                      }
                      const latest = norm[norm.length-1];
                      const gameTurn = Number((snapshot as any)?.turns || (snapshot as any)?.current_turn || 0);
                      if (latest && Number(latest.turn) < gameTurn) {
                        norm.push({ turn: gameTurn, rate: latest.rate });
                      }
                      return norm;
                    })()} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                      <XAxis dataKey="turn" tick={{ fontSize: 10 }} />
                      {(() => {
                        const hist = Array.isArray(row?.history) ? row.history as Array<{turn:number; rate?:number; rate_percent?:number}> : [];
                        const vals = hist.map(h => Number((h as any).rate_percent != null ? (h as any).rate_percent : (h as any).rate || 0)).filter(v => Number.isFinite(v));
                        let ymin = 0, ymax = 100;
                        if (vals.length >= 2) {
                          const min = Math.min(...vals);
                          const max = Math.max(...vals);
                          if (isFinite(min) && isFinite(max)) {
                            if (Math.abs(max - min) <= 1.0) {
                              const pad = Math.max(0.05, (max - min) * 0.5 || 0.1);
                              ymin = Math.max(0, min - pad);
                              ymax = Math.min(100, max + pad);
                              if (ymin === ymax) { ymin = Math.max(0, ymin - 0.1); ymax = Math.min(100, ymax + 0.1); }
                            } else { ymin = 0; ymax = 100; }
                          }
                        }
                        const range = Math.max(0.0001, ymax - ymin);
                        const toPct = (v:number) => `${Number(v).toFixed(range < 2 ? 1 : 0)}%`;
                        return <YAxis domain={[ymin, ymax]} tickCount={5} interval={0} tickFormatter={toPct} tick={{ fontSize: 10 }} width={52} allowDataOverflow />;
                      })()}
                      <Tooltip formatter={(v:any)=>`${Number(v).toFixed(2)}%`} labelFormatter={(l:any)=>`Round ${l}`} animationDuration={0} />
                      <Line type="monotone" dataKey="rate" stroke="#8e44ad" strokeWidth={2} dot={false} animationDuration={0} isAnimationActive={false} />
                    </RCLineChart>
                  </ResponsiveContainer>
                ) : (
                  <Sparkline height={160} showAxes />
                )}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', fontSize:10 }}>
                  <span
                    title={row.allow_bonds ? 'Owner currently accepts new bond investments.' : 'Owner has disabled new bond investing.'}
                    style={{ background: row.allow_bonds ? '#2d5a2d' : '#5a2d2d', padding:'2px 6px', borderRadius:4, fontWeight:600 }}
                  >{row.allow_bonds ? 'Investing ON' : 'Investing OFF'}</span>
                  <span
                    title={'Current bond interest rate (coupon) paid every period. Historical chart shows past rates.'}
                    style={{ background:'#333', padding:'2px 6px', borderRadius:4 }}
                  >Rate: {Number((row.rate_percent != null ? row.rate_percent : row.rate) || 0).toFixed(2)}%</span>
                  <span
                    title={'Number of turns between coupon payouts.'}
                    style={{ background:'#333', padding:'2px 6px', borderRadius:4 }}
                  >Period: {row.period_turns || 1}t</span>
                </div>
                <div style={{ display:'flex', gap:6, justifyContent:'flex-end', flexWrap:'wrap' }}>
                {isMine ? (
                  <button className="btn btn-ghost" style={{ padding:'2px 8px', fontSize:11 }} onClick={() => setShowBondSettingsLocal({ owner: row.owner })}>Settings</button>
                ) : (
                  row?.allow_bonds ? (
                    <button className="btn btn-ghost" style={{ padding:'2px 8px', fontSize:11 }} onClick={() => setShowBondInvestLocal({ owner: row.owner })}>Invest</button>
                  ) : <span className="ui-xs" style={{ opacity:0.6 }}>Disabled</span>
                )}
                </div>
              </div>
            </div>
          );
        })}
        {bonds.length === 0 ? <div style={{ opacity: 0.6 }}>No bonds yet.</div> : null}
      </div>
      {showBondInvestLocal ? (
        <BondTwoPhaseInvestModal
          onClose={() => setShowBondInvestLocal(null)}
          lobbyId={lobbyId}
          snapshot={snapshot}
          owner={showBondInvestLocal.owner}
        />
      ) : null}
      {showBondSettingsLocal ? (
        <BondSettingsModal
          onClose={() => setShowBondSettingsLocal(null)}
          lobbyId={lobbyId}
          snapshot={snapshot}
          owner={showBondSettingsLocal.owner}
        />
      ) : null}
    </div>
  );
}

/* Payments page */
function PaymentsPage({ snapshot, isMobile }: { snapshot: GameSnapshot; isMobile: boolean }) {
  const recurring = ((snapshot as any).recurring || []) as any[];
  const rentals = ((snapshot as any).property_rentals || []) as any[];
  const payouts = ((snapshot as any).bond_payouts || []) as any[];
  // Build quick tile name lookup so rentals can list their properties
  const tilesArr = ((snapshot as any).tiles || []) as any[];
  const tiles: Record<number, any> = Array.isArray(tilesArr)
    ? tilesArr.reduce((acc: Record<number, any>, t: any, idx: number) => { acc[idx] = t; return acc; }, {})
    : {};
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const bubbleStyle: React.CSSProperties = {
    background: 'var(--color-surface-alt, rgba(255,255,255,0.05))',
    border: '1px solid var(--color-border)',
    padding: '8px 10px',
    borderRadius: 12,
    fontSize: 14,
    lineHeight: 1.35,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%', overflow: isMobile ? 'visible' : 'hidden' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Payments Overview</div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: isMobile ? 16 : 18, overflowY: 'auto', paddingBottom: 8 }}>
        {/* Recurring per-turn payments */}
        <div className="ui-labelframe" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="ui-h3" style={{ marginBottom: 8 }}>Per Turn Payments</div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 10, alignContent: 'start' }}>
            {recurring.length === 0 ? (
              <div style={{ opacity: 0.6, fontSize: 13 }}>None</div>
            ) : recurring.map((r: any, idx: number) => {
              return (
                <div key={idx} style={bubbleStyle}>
                  <div style={{ fontWeight: 600 }}>
                    {normalizeName(r.from)} → {normalizeName(r.to)} <span style={{ opacity: 0.8 }}>${r.amount}/turn</span>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>Recurring payment • {plural(r.turns_left, 'turn')} left</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Property rentals */}
        <div className="ui-labelframe" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="ui-h3" style={{ marginBottom: 8 }}>Rentals</div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 10, alignContent: 'start' }}>
            {rentals.length === 0 ? (
              <div style={{ opacity: 0.6, fontSize: 13 }}>Empty</div>
            ) : rentals.map((r: any, idx: number) => {
              const propNames = (r.properties || []).map((pos: number) => tiles[pos]?.name || `#${pos}`).join(', ');
              return (
                <div key={idx} style={bubbleStyle}>
                  <div style={{ fontWeight: 600 }}>{normalizeName(r.renter)} gets {r.percentage}% rent</div>
                  <div style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{propNames || '—'}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>Owner: {normalizeName(r.owner)} • {plural(r.turns_left, 'turn')} left</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Bond payouts */}
        <div className="ui-labelframe" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="ui-h3" style={{ marginBottom: 8 }}>Bond Payouts</div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 10, alignContent: 'start' }}>
            {payouts.length === 0 ? (
              <div style={{ opacity: 0.6, fontSize: 13 }}>Empty</div>
            ) : payouts.map((bp: any, idx: number) => {
              const rate = Number(bp.rate_percent || 0);
              const period = bp.period_turns || 1;
              const principal = Number(bp.principal || 0);
              const coupon = Number(bp.coupon || 0);
              // Show base formula if we can recompute (principal * rate% * period)
              const baseFormula = rate > 0 && principal > 0 ? `${rate}% of $${principal.toLocaleString()} × ${period}t` : null;
              const nextDue = bp.next_due_in_turns ?? null;
              return (
                <div key={idx} style={bubbleStyle}>
                  <div style={{ fontWeight: 600 }}>
                    {normalizeName(bp.owner)} pays {normalizeName(bp.investor)} <span style={{ opacity: 0.9 }}>${coupon.toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {baseFormula ? (<span>{baseFormula} = ${coupon.toLocaleString()}</span>) : (<span>Coupon ${coupon.toLocaleString()}</span>)}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>
                    Rate {rate.toFixed(2)}% • Principal ${principal.toLocaleString()} • Every {plural(period, 'turn')}{typeof nextDue === 'number' ? ` • Next in ${nextDue} turn${nextDue === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Keep log component above DashboardGrid to avoid any HMR/hoisting quirks
// (moved above DashboardGrid)

function DashboardGrid({ lobbyId, snapshot, isMobile }: { lobbyId: string; snapshot: GameSnapshot; isMobile: boolean }) {
  // Resolve my name for spending/transactions context
  const storedName = (getRemembered().displayName || '').trim();
  const myName = storedName;
  const [selectedPlayer, setSelectedPlayer] = useState<string>(() => (
    (snapshot.players?.[snapshot.current_turn]?.name) || (snapshot.players?.[0]?.name) || ''
  ));
  const [showStockSettings, setShowStockSettings] = useState<boolean>(false);
  const [showBondSettings, setShowBondSettings] = useState<boolean>(false);
  const [showBondBuy, setShowBondBuy] = useState<null | { owner: string }>(null);
  const [showStockInvest, setShowStockInvest] = useState<null | { owner: string }>(null);
  const [showStockSell, setShowStockSell] = useState<null | { owner: string }>(null);

  // Keep selected player valid when roster changes
  useEffect(() => {
    const list = snapshot.players || [];
    if (!list.find(p => equalNames(p.name, selectedPlayer))) {
      const fallback = (list?.[snapshot.current_turn]?.name) || (list?.[0]?.name) || '';
      setSelectedPlayer(fallback);
    }
  }, [snapshot.players, snapshot.current_turn]);
  const spendingAgg = useMemo(() => {
    const order = ["Fees", "Rent", "Properties", "Trades"] as const;
    const agg: Record<string, number> = { Fees: 0, Rent: 0, Properties: 0, Trades: 0 };
    const me = selectedPlayer || '';
    const isName = (a?: string, b?: string) => !!a && !!b && equalNames(a, b);

    // Prefer precise server ledger for trades/rent
    const ledger = (snapshot as any)?.ledger as Array<any> | undefined;
    if (Array.isArray(ledger)) {
      for (const e of ledger) {
        const t = String(e?.type || '').toLowerCase();
        const from = String(e?.from || '');
        const amount = Number(e?.amount || 0);
        if (!amount || !isName(from, me)) continue; // Only count outflows
        if (t === 'trade_cash' || t === 'rental_upfront' || t === 'recurring' || t === 'bond_invest') {
          agg.Trades += Math.abs(amount);
          continue;
        }
        if (t === 'rent' || t === 'rent_split') {
          agg.Rent += Math.abs(amount);
          continue;
        }
        if (t === 'tax') {
          agg.Fees += Math.abs(amount);
          continue;
        }
        if (t === 'buy_property' || t === 'unmortgage' || t === 'buy_house' || t === 'buy_hotel') {
          agg.Properties += Math.abs(amount);
          continue;
        }
      }
    }

    // Fallback for fees and property spend from log (and any missing categories)
    const parseActorTarget = (txtRaw: string): { actor?: string; target?: string } => {
      const txt = txtRaw.trim();
      let m = txt.match(/^([^:]+?)\s+paid\s+\$[\d,]+\s+.*?\s+to\s+([^:]+?)(?:\s|$)/i);
      if (m) return { actor: m[1], target: m[2] };
      m = txt.match(/^([^:]+?)\s+paid\s+\$[\d,]+\b/i);
      if (m) return { actor: m[1] };
      m = txt.match(/^([^:]+?)\s+bought\b/i);
      if (m) return { actor: m[1] };
      m = txt.match(/^([^:]+?)\s+unmortgag(?:e|ed)\b/i);
      if (m) return { actor: m[1] };
      m = txt.match(/^Property rental:\s+([^:]+?)\s+paid\s+\$[\d,]+\b/i);
      if (m) return { actor: m[1] };
      return {};
    };
    for (const e of (snapshot.log || []) as any[]) {
      const t = String(e.type || '').toLowerCase();
      const txt = String(e.text || '');
      const { actor } = parseActorTarget(txt);
      if (!isName(actor, me)) continue;
      const amt = extractAmount(txt.toLowerCase());
      if (!amt) continue;
      if (t === 'tax' || /\b(tax|fee|fine|luxury)\b/i.test(txt) || (t === 'jail' && /\bpaid\b/i.test(txt))) {
        agg.Fees += Math.abs(amt);
        continue;
      }
      if (t === 'buy' || t === 'buy_house' || t === 'buy_hotel' || t === 'unmortgage' || t === 'auto_unmortgage' || /\b(bought|buy\b|house|hotel|unmortgage|property)\b/i.test(txt)) {
        if (!/\bsold\b/i.test(txt)) {
          agg.Properties += Math.abs(amt);
        }
        continue;
      }
    }
    const total = Object.values(agg).reduce((a, b) => a + b, 0) || 1;
    return order.map((k) => ({ label: k as string, value: agg[k], pct: agg[k] / total }));
  }, [snapshot.ledger, snapshot.log, selectedPlayer]);

  // Live balance series (client-side) for the current player; use snapshot.turns when available for x
  const balanceSeriesRef = useRef<Array<{ x: number; value: number }>>([]);
  const curCash = (snapshot.players || []).find(p => equalNames(p.name, selectedPlayer))?.cash ?? 0;
  useEffect(() => {
    // Reset history when player identity changes
    balanceSeriesRef.current = [];
  }, [selectedPlayer]);
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

  // Income/Spending tracking per turn (x-axis = total turns advanced)
  const incomeSeriesRef = useRef<Array<{ x: number; value: number }>>([]);
  const spendingSeriesRef = useRef<Array<{ x: number; value: number }>>([]);
  const turnAccumRef = useRef<{ income: number; spend: number }>({ income: 0, spend: 0 });
  const lastTurnRef = useRef<number>(typeof (snapshot as any)?.turns === 'number' ? Number((snapshot as any).turns) : 0);
  const prevCashRef = useRef<number | null>(null);
  const baselinePushedRef = useRef<boolean>(false);
  const withinTurnTickRef = useRef<number>(0);
  // rafRef removed; not used

  // Reset tracking when identity changes
  useEffect(() => {
    incomeSeriesRef.current = [];
    spendingSeriesRef.current = [];
    turnAccumRef.current = { income: 0, spend: 0 };
    lastTurnRef.current = typeof (snapshot as any)?.turns === 'number' ? Number((snapshot as any).turns) : 0;
    prevCashRef.current = (snapshot.players || []).find(p => equalNames(p.name, selectedPlayer))?.cash ?? 0;
    baselinePushedRef.current = false;
    withinTurnTickRef.current = 0;
  }, [selectedPlayer]);

  // Aggregate income/spend using cash deltas for selected player, roll-up per turn
  useEffect(() => {
    const currentCash = (snapshot.players || []).find(p => equalNames(p.name, selectedPlayer))?.cash ?? 0;
    if (prevCashRef.current == null) {
      prevCashRef.current = currentCash;
    } else if (currentCash !== prevCashRef.current) {
      const delta = currentCash - prevCashRef.current;
      if (delta > 0) turnAccumRef.current.income += delta;
      else if (delta < 0) turnAccumRef.current.spend += -delta;
      prevCashRef.current = currentCash;
    }
    const curTurn = typeof (snapshot as any)?.turns === 'number' ? Number((snapshot as any).turns) : 0;
    // Push an initial baseline at current turn so chart starts anchored
    if (!baselinePushedRef.current) {
      incomeSeriesRef.current.push({ x: curTurn, value: 0 });
      spendingSeriesRef.current.push({ x: curTurn, value: 0 });
      baselinePushedRef.current = true;
    }
    // If turn advanced, finalize previous turn and reset accumulators
    if (curTurn > lastTurnRef.current) {
      const x = curTurn;
      const acc = turnAccumRef.current;
      incomeSeriesRef.current.push({ x, value: acc.income });
      spendingSeriesRef.current.push({ x, value: acc.spend });
      const MAX = 240; // keep last ~240 data points
      if (incomeSeriesRef.current.length > MAX) incomeSeriesRef.current.splice(0, incomeSeriesRef.current.length - MAX);
      if (spendingSeriesRef.current.length > MAX) spendingSeriesRef.current.splice(0, spendingSeriesRef.current.length - MAX);
      turnAccumRef.current = { income: 0, spend: 0 };
      lastTurnRef.current = curTurn;
      withinTurnTickRef.current = 0;
    } else {
      // While still in the same turn, emit an in-progress point so users see updates immediately
      withinTurnTickRef.current += 1;
      const xLive = curTurn + withinTurnTickRef.current / 1000; // fractional offset within the same turn
      const acc = turnAccumRef.current;
      const pushOrUpdate = (arr: Array<{ x: number; value: number }>, val: number) => {
        const last = arr[arr.length - 1];
        if (last && Math.abs(last.x - xLive) < 1e-9) {
          last.value = val;
        } else {
          arr.push({ x: xLive, value: val });
        }
      };
      pushOrUpdate(incomeSeriesRef.current, acc.income);
      pushOrUpdate(spendingSeriesRef.current, acc.spend);
      const MAX = 240;
      if (incomeSeriesRef.current.length > MAX) incomeSeriesRef.current.splice(0, incomeSeriesRef.current.length - MAX);
      if (spendingSeriesRef.current.length > MAX) spendingSeriesRef.current.splice(0, spendingSeriesRef.current.length - MAX);
    }
  }, [curCash, snapshot.turns, snapshot.last_action, selectedPlayer]);

  // Stocks and bonds data (fallback to empty arrays)
  const rawStocks = (((window as any).__latestSnapshot || snapshot)?.stocks as any[] | undefined) || [];
  const rawBonds = (((window as any).__latestSnapshot || snapshot)?.bonds as any[] | undefined) || [];
  // One chart per player (owner): dedupe by owner name
  const stocksByOwner = useMemo(() => {
    const map = new Map<string, any>();
    for (const st of rawStocks) {
      const key = (st?.owner || '').toLowerCase();
      if (key && !map.has(key)) map.set(key, st);
    }
    return Array.from(map.values());
  }, [rawStocks]);
  // Player color mapping for consistent mini chart colors
  const stockColorMap: Record<string,string> = useMemo(()=>{
    const m: Record<string,string> = {};
    for (const p of (snapshot.players||[])) { if (p?.name && p?.color) m[p.name.toLowerCase()] = p.color; }
    return m;
  }, [snapshot.players]);
  const colorForStockOwner = (owner?: string, idx: number = 0) => {
    if (!owner) return ['#2980b9','#27ae60','#8e44ad','#e67e22','#c0392b','#16a085'][idx % 6];
    const c = stockColorMap[owner.toLowerCase()];
    return c || ['#2980b9','#27ae60','#8e44ad','#e67e22','#c0392b','#16a085'][idx % 6];
  };
  const bondsByOwner = useMemo(() => {
    const map = new Map<string, any>();
    for (const b of rawBonds) {
      const key = (b?.owner || '').toLowerCase();
      if (key && !map.has(key)) map.set(key, b);
    }
    return Array.from(map.values());
  }, [rawBonds]);

  return (
    <div 
      className="dashboard-root-grid" 
      style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr' : 'clamp(180px, 22vw, 240px) 1fr 1fr clamp(200px, 24vw, 280px)', 
        gap: isMobile ? 16 : 12, 
        alignItems: 'stretch', 
        height: isMobile ? 'auto' : '100%', 
        minHeight: 0,
        overflowY: isMobile ? 'auto' : 'hidden',
        padding: isMobile ? '0 4px 16px 4px' : '0'
      }}
    >
      {/* Column 1: Game Log + Chat - Hide on mobile */}
      {!isMobile && (
        <div className="dashboard-col1" style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, maxHeight: '100%', overflow: 'hidden' }}>
          {/* Game Log - Fixed at top 200px */}
          <div className="ui-labelframe" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '200px', maxHeight: '200px', minHeight: '200px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="ui-h3" style={{ marginBottom: 6, flexShrink: 0 }}>Game Log</div>
            <GameLogPanel snapshot={snapshot} />
          </div>
          {/* Game Chat - Fixed from 212px to bottom */}
          <div className="ui-labelframe" style={{ position: 'absolute', top: '212px', left: 0, right: 0, bottom: 0, maxHeight: 'calc(100% - 212px)', minHeight: '200px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="ui-h3" style={{ marginBottom: 6, flexShrink: 0 }}>💬 Game Chat</div>
            <div style={{ position: 'absolute', top: '30px', left: '8px', right: '8px', bottom: '8px', overflow: 'hidden' }}>
              <div className="game-chat-scroll" style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
                <ChatPanel lobbyId={lobbyId} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Column 2: Balance & Summary with Spending beneath; Bottom: Payments + Rentals */}
      <div style={{ display: 'grid', gap: 12, gridTemplateRows: '65% 35%', height: '100%', minWidth: 0, minHeight: 0 }}>
        {/* Balance & Summary (with Spending inside) */}
        <div className="ui-labelframe" style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto 1fr', minHeight: 0, position: 'relative', paddingBottom: 8 }}>
          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="ui-h3" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Balance Summary</span>
              <select className="input" value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)} style={{ height: 28, fontSize: 12 }}>
                {(snapshot.players || []).map(p => (
                  <option key={p.name} value={p.name}>{normalizeName(p.name)}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', minHeight: 0, position: 'relative' }}>
              <div>
                <div className="ui-sm" style={{ opacity: 0.8 }}>Player</div>
                <div style={{ fontWeight: 700 }}>{normalizeName(selectedPlayer || (snapshot.players?.[snapshot.current_turn]?.name || '—'))}</div>
                <div className="ui-sm" style={{ opacity: 0.8 }}>Balance</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>${(snapshot.players || []).find(p => equalNames(p.name, selectedPlayer))?.cash ?? '—'}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--color-border)', borderRadius: 6, color: 'var(--muted)', pointerEvents: 'none' }}>
                  <span className="ui-sm">Balance & Summary chart coming later</span>
                </div>
              </div>
            </div>
            {/* Spending inside same container */}
            <div className="ui-h3" style={{ marginTop: 6, marginBottom: 6 }}>Spending</div>
            <div style={{ 
              display: isMobile ? 'flex' : 'relative', 
              flexDirection: isMobile ? 'column' : undefined,
              gap: isMobile ? 12 : 0,
              minHeight: 0, 
              paddingRight: isMobile ? 0 : 180, 
              paddingBottom: 12 
            }}>
              <SpendingLegend entries={spendingAgg} />
              <div style={{ 
                position: isMobile ? 'static' : 'absolute', 
                right: isMobile ? 'auto' : 6, 
                bottom: isMobile ? 'auto' : -22, 
                width: isMobile ? '160px' : 160, 
                height: isMobile ? '160px' : 160, 
                pointerEvents: 'none',
                display: 'flex',
                justifyContent: isMobile ? 'center' : 'flex-start',
                alignSelf: isMobile ? 'center' : 'auto'
              }}>
                <PieChart entries={spendingAgg} size={140} inner={50} legend={false} />
              </div>
            </div>
          </div>
        </div>
        {/* Bottom: Payments + Rentals summary - Hide on mobile, will be shown after stocks */}
        {!isMobile && (
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
        )}
      </div>

      {/* Column 3: All Stocks */}
      <div className="ui-labelframe" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <div className="ui-h3" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Stocks</span>
          {myName ? (
            <button className="btn btn-ghost" onClick={() => setShowStockSettings(true)} style={{ padding: '2px 8px', fontSize: 12 }}>Settings</button>
          ) : null}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gridAutoRows: isMobile ? 'minmax(300px, 1fr)' : 'minmax(200px, 1fr)', gap: isMobile ? 16 : 10, minHeight: 0, overflowY: 'auto' }}>
          {stocksByOwner.map((row: any, i: number) => {
            const isMine = row?.owner && myName && equalNames(row.owner, myName);
            const allowInvest = !!row?.allow_investing;
            const myHolding = (row?.holdings || []).find((h: any) => myName && equalNames(h.investor, myName));
            return (
              <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row ? normalizeName(row.owner) : `Stock ${i + 1}`}</div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  {row?.history && row.history.length ? (
                    <ResponsiveContainer width="100%" height={isMobile ? 200 : 140}>
                      <RCLineChart data={row.history} margin={{ top: 6, right: isMobile ? 12 : 6, left: isMobile ? 8 : 6, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                        <XAxis dataKey="turn" tick={{ fontSize: isMobile ? 12 : 10 }} />
                        <YAxis tickFormatter={(v:number)=>`$${Number(v).toLocaleString()}`} tick={{ fontSize: isMobile ? 12 : 10 }} width={isMobile ? 60 : 52} />
                        <Tooltip formatter={(v:any)=>`$${Number(v).toLocaleString()}`} labelFormatter={(l:any)=>`Round ${l}`} animationDuration={0} />
                        <Line type="monotone" dataKey="pool" stroke={colorForStockOwner(row.owner, i)} strokeWidth={isMobile ? 3 : 2} dot={false} animationDuration={0} isAnimationActive={false} />
                      </RCLineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Sparkline height={isMobile ? 200 : 140} showAxes />
                  )}
                </div>
                {!isMine ? (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6, alignItems: 'center' }}>
                    {allowInvest ? (
                      <button className="btn btn-ghost" onClick={() => setShowStockInvest({ owner: row.owner })}>Buy</button>
                    ) : (
                      <span className="ui-xs" style={{ opacity: 0.7 }}>Disabled</span>
                    )}
                    {(myHolding && myHolding.shares > 0) ? (
                      <button className="btn btn-ghost" onClick={() => setShowStockSell({ owner: row.owner })}>Sell</button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Column 4: Bonds — charts (top ~90%), payouts (bottom ~10%) */}
      <div className="ui-labelframe" style={{ display: 'grid', gridTemplateRows: '9fr 1fr', gap: 8, minWidth: 0, minHeight: 0 }}>
        {/* Bonds charts area */}
        <div style={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="ui-h3" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span>Bonds Charts</span>
            {myName ? (
              <button className="btn btn-ghost" onClick={() => setShowBondSettings(true)} style={{ padding: '2px 8px', fontSize: 12 }}>Settings</button>
            ) : null}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gridAutoRows: isMobile ? 'minmax(300px, 1fr)' : 'minmax(200px, 1fr)', gap: isMobile ? 16 : 10, minHeight: 0, overflowY: 'auto' }}>
            {bondsByOwner.map((row: any, i: number) => {
              const isMine = row?.owner && myName && equalNames(row.owner, myName);
              return (
                <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: isMobile ? 12 : 8, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: isMobile ? 14 : 12, fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row ? normalizeName(row.owner) : `Bond ${i + 1}`}</div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    {row?.history && row.history.length ? (
                      <ResponsiveContainer width="100%" height={isMobile ? 200 : 140}>
                        <RCLineChart data={(function(){
                          const raw = Array.isArray(row.history) ? row.history : [];
                          // Normalize
                          let norm = raw.map((h:any)=>({ ...h, rate: (h.rate_percent != null) ? h.rate_percent : h.rate }));
                          // If only one point, synthesize a starting baseline at turn 0 (if not already) and extend a horizontal segment so chart renders a line not a single dot
                          if (norm.length === 1) {
                            const only = norm[0];
                            const curTurn = Number(only.turn)||0;
                            if (curTurn > 0 && !norm.some((p: any)=>p.turn===0)) {
                              norm = [{ turn:0, rate: only.rate }, ...norm];
                            }
                          }
                          // Ensure there is at least a second point for current active turn (flat) if last turn is well behind snapshot turn
                          const latest = norm[norm.length-1];
                          const gameTurn = Number((snapshot as any)?.turns || (snapshot as any)?.current_turn || 0);
                          if (latest && Number(latest.turn) < gameTurn) {
                            norm.push({ turn: gameTurn, rate: latest.rate });
                          }
                          return norm;
                        })()} margin={{ top: 6, right: isMobile ? 12 : 6, left: isMobile ? 8 : 6, bottom: 6 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                          <XAxis dataKey="turn" tick={{ fontSize: isMobile ? 12 : 10 }} />
                          {(() => {
                            const hist = Array.isArray(row?.history) ? row.history as Array<{turn:number; rate?:number; rate_percent?:number}> : [];
                            const vals = hist.map(h => Number((h as any).rate_percent != null ? (h as any).rate_percent : (h as any).rate || 0)).filter(v => Number.isFinite(v));
                            let ymin = 0, ymax = 100;
                            if (vals.length >= 2) {
                              const min = Math.min(...vals);
                              const max = Math.max(...vals);
                              if (isFinite(min) && isFinite(max)) {
                                if (Math.abs(max - min) <= 1.0) {
                                  const pad = Math.max(0.05, (max - min) * 0.5 || 0.1);
                                  ymin = Math.max(0, min - pad);
                                  ymax = Math.min(100, max + pad);
                                  if (ymin === ymax) { ymin = Math.max(0, ymin - 0.1); ymax = Math.min(100, ymax + 0.1); }
                                } else {
                                  ymin = 0; ymax = 100;
                                }
                              }
                            }
                            const range = Math.max(0.0001, ymax - ymin);
                            const toPct = (v:number) => `${Number(v).toFixed(range < 2 ? 1 : 0)}%`;
                            return (
                              <YAxis domain={[ymin, ymax]} tickCount={5} interval={0} tickFormatter={toPct} tick={{ fontSize: isMobile ? 12 : 10 }} width={isMobile ? 50 : 40} allowDataOverflow />
                            );
                          })()}
                          <Tooltip formatter={(v:any)=>`${Number(v).toFixed(2)}%`} labelFormatter={(l:any)=>`Round ${l}`} animationDuration={0} />
                          <Line type="monotone" dataKey="rate" stroke="#8e44ad" strokeWidth={isMobile ? 3 : 2} dot={false} animationDuration={0} isAnimationActive={false} />
                        </RCLineChart>
                      </ResponsiveContainer>
                    ) : (
                      <Sparkline height={isMobile ? 200 : 140} showAxes />
                    )}
                  </div>
                  {row ? (
                    <div className="ui-xs" style={{ marginTop: 6, opacity: 0.8 }}>Rate {(row.rate_percent != null ? row.rate_percent : row.rate) || 0}% • Every {row.period_turns || 1}t</div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                    {isMine ? (
                      <button className="btn btn-ghost" onClick={() => setShowBondSettings(true)} style={{ padding: '2px 8px', fontSize: 12 }}>Settings</button>
                    ) : (
                      row?.allow_bonds ? (
                        <button className="btn btn-ghost" onClick={() => setShowBondBuy({ owner: row.owner })}>Invest</button>
                      ) : (
                        <span className="ui-xs" style={{ opacity: 0.7 }}>Disabled</span>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Payouts summary (bottom band ~10%) */}
        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="ui-h3" style={{ marginBottom: 4 }}>Payouts</div>
          <div className="ui-sm" style={{ flex: 1, overflowY: 'auto' }}>
            {(!((snapshot as any).bond_payouts) || ((snapshot as any).bond_payouts || []).length === 0) ? (
              <div style={{ opacity: 0.7 }}>Empty</div>
            ) : (
              <>
                {((snapshot as any).bond_payouts || []).map((bp: any, idx: number) => (
                  <div key={idx} style={{ overflowWrap: 'anywhere' }}>
                    {normalizeName(bp.owner)} → {normalizeName(bp.investor)}: ${bp.coupon || 0} every {bp.period_turns || 1}t
                    {bp.principal ? (
                      <span style={{ opacity: 0.8 }}> (principal ${bp.principal}{(() => {
                        const n = bp.next_due_in_turns;
                        if (typeof n === 'number') return n === 0 ? ' • due now' : ` • next in ${n}t`;
                        return '';
                      })()}{(() => {
                        // Use payout_id where available (from ledger first), fallback to sum by pair
                        const ledger = (snapshot as any).ledger as any[] | undefined;
                        const seen = new Set<string>();
                        let sum = 0;
                        if (Array.isArray(ledger)) {
                          for (const e of ledger) {
                            if (String(e?.type||'').toLowerCase() !== 'bond_coupon') continue;
                            if (String(e?.from||'').toLowerCase() !== String(bp.owner||'').toLowerCase()) continue;
                            if (String(e?.to||'').toLowerCase() !== String(bp.investor||'').toLowerCase()) continue;
                            const pid = String(e?.meta?.payout_id||'');
                            if (pid) {
                              if (seen.has(pid)) continue;
                              seen.add(pid);
                            }
                            const v = Number(e?.amount||0);
                            if (Number.isFinite(v)) sum += Math.max(0, v);
                          }
                        }
                        if (sum === 0) {
                          // Fallback to log parsing with payout_id if present
                          for (const e of ((snapshot.log||[]) as any[])) {
                            if (String(e.type||'') !== 'bond_coupon') continue;
                            const txt = String(e.text||'');
                            if (!txt.toLowerCase().includes(String(bp.owner||'').toLowerCase())) continue;
                            if (!txt.toLowerCase().includes(String(bp.investor||'').toLowerCase())) continue;
                            const m = txt.match(/\$([\d,]+)/);
                            const v = m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
                            const pidm = txt.match(/id\s+([^\)\s]+)/i);
                            const pid = e.payout_id || (pidm ? pidm[1] : '');
                            if (pid) {
                              if (seen.has(pid)) continue; seen.add(pid);
                            }
                            if (Number.isFinite(v)) sum += Math.max(0, v);
                          }
                        }
                        const paid = sum;
                        return paid ? ` • paid so far $${paid}` : '';
                      })()})</span>
                    ) : null}
                  </div>
                ))}
                {(() => {
                  const ledger = (snapshot as any).ledger as any[] | undefined;
                  const seen = new Set<string>();
                  let total = 0;
                  if (Array.isArray(ledger)) {
                    for (const e of ledger) {
                      if (String(e?.type||'').toLowerCase() !== 'bond_coupon') continue;
                      const pid = String(e?.meta?.payout_id||'');
                      if (pid) { if (seen.has(pid)) continue; seen.add(pid); }
                      const v = Number(e?.amount||0);
                      if (Number.isFinite(v)) total += Math.max(0, v);
                    }
                  }
                  if (total === 0) {
                    for (const e of ((snapshot.log||[]) as any[])) {
                      if (String(e.type||'') !== 'bond_coupon') continue;
                      const txt = String(e.text||'');
                      const m = txt.match(/\$([\d,]+)/);
                      const v = m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
                      const pidm = txt.match(/id\s+([^\)\s]+)/i);
                      const pid = (e as any).payout_id || (pidm ? pidm[1] : '');
                      if (pid) { if (seen.has(pid)) continue; seen.add(pid); }
                      if (Number.isFinite(v)) total += Math.max(0, v);
                    }
                  }
                  return total > 0 ? (
                    <div className="ui-xs" style={{ marginTop: 6, opacity: 0.85 }}>Total paid so far: ${total}</div>
                  ) : null;
                })()}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile-only: Game Log and Chat in single column */}
      {isMobile && (
        <>
          {/* Game Log */}
          <div className="ui-labelframe" style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
            <div className="ui-h3" style={{ marginBottom: 8, flexShrink: 0 }}>Game Log</div>
            <GameLogPanel snapshot={snapshot} />
          </div>
          
          {/* Game Chat */}
          <div className="ui-labelframe" style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
            <div className="ui-h3" style={{ marginBottom: 8, flexShrink: 0 }}>💬 Game Chat</div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <div className="game-chat-scroll" style={{ position: 'absolute', inset: '8px', overflowY: 'auto', overflowX: 'hidden' }}>
                <ChatPanel lobbyId={lobbyId} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Settings Modals */}
      {showStockSettings ? (
        <StockSettingsModal
          onClose={() => setShowStockSettings(false)}
          lobbyId={lobbyId}
          snapshot={snapshot}
          owner={myName}
        />
      ) : null}
      {showBondSettings ? (
        <BondSettingsModal
          onClose={() => setShowBondSettings(false)}
          lobbyId={lobbyId}
          snapshot={snapshot}
          owner={myName}
        />
      ) : null}
      {showBondBuy ? (
        <BondTwoPhaseInvestModal
          onClose={() => setShowBondBuy(null)}
          lobbyId={lobbyId}
          snapshot={snapshot}
          owner={showBondBuy.owner}
        />
      ) : null}
      {showStockInvest ? (
        <StockQuickInvestModal
          onClose={() => setShowStockInvest(null)}
          lobbyId={lobbyId}
          snapshot={snapshot}
          owner={showStockInvest.owner}
        />
      ) : null}
      {showStockSell ? (
        <StockQuickSellModal
          onClose={() => setShowStockSell(null)}
          lobbyId={lobbyId}
          snapshot={snapshot}
          owner={showStockSell.owner}
        />
      ) : null}
      <style>{`
        .game-log-scroll, .game-chat-scroll { scrollbar-width: thin; }
        .game-log-scroll::-webkit-scrollbar, .game-chat-scroll::-webkit-scrollbar { width:8px; }
        .game-log-scroll::-webkit-scrollbar-thumb, .game-chat-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.15); border-radius:4px; }
        .game-log-scroll:hover::-webkit-scrollbar-thumb, .game-chat-scroll:hover::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.3); }
      `}</style>
      
      {/* Mobile: Payments + Rentals section (shown after all other content) */}
      {isMobile && (
        <div className="ui-labelframe" style={{ marginTop: 16, display: 'grid', gridTemplateRows: '1fr 1fr', gap: 8, minHeight: 0 }}>
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
      )}
    </div>
  );
}

// ChatPanel now shared in ./ChatPanel

function GameLogPanel({ snapshot }: { snapshot: GameSnapshot }) {
  const { ref } = useAutoScroll<HTMLDivElement>([snapshot?.log], { 
    smooth: true, 
    enabled: true,
    threshold: 30 
  });
  // Filter to only money-in/out and feature state changes
  const items = ((snapshot?.log || []) as any[]).filter((e: any) => {
    const t = String(e.type || '').toLowerCase();
    if (t === 'rent' || t === 'recurring_pay' || t === 'rental_created') return true;
    if (t === 'bond_invest' || t === 'bond_coupon' || t === 'stock_invest' || t === 'stock_sell') return true;
    // Show denial reasons for stock actions to aid user understanding
    if (t === 'stock_invest_denied' || t === 'stock_sell_denied') return true;
    if (t === 'bond_settings' || t === 'stock_settings' || t === 'auto_mortgage') return true;
    if (t === 'trade_accepted') return true;
    return false;
  }).slice(-80);
  const icon = (t: string) => {
    const m: Record<string, string> = {
      rolled: '🎲',
      buy: '🏪',
      buy_house: '🏚️',
      sell_house: '🏚️',
      buy_hotel: '🏨',
      sell_hotel: '🏨',
      mortgage: '🏦',
      unmortgage: '💰',
      rent: '💸',
      tax: '🧾',
      pass_go: '🚏',
      jail: '🚓',
      gotojail: '🚔',
      end_turn: '⏭',
      trade_created: '🤝',
      trade_accepted: '✅',
      trade_declined: '❌',
      trade_canceled: '🗑️',
      recurring_created: '🔁',
      recurring_pay: '💱',
      recurring_done: '✔️',
      rental_offered: '🏷️',
      rental_created: '📄',
      rental_declined: '🚫',
      rental_canceled: '🗑️',
      stock_invest: '📈',
      stock_sell: '📉',
  stock_invest_denied: '🚫',
  stock_sell_denied: '🚫',
      bond_invest: '💰',
      bond_coupon: '💵',
      auto_mortgage: '⚙️',
      card: '🎴',
      card_draw: '🃏',
      game_over: '🏁',
      bankrupt: '💥',
      disconnect_kick: '👋',
      debt_unpaid: '❗',
    };
    return m[t] || '•';
  };
  return (
    <div className="game-log-scroll" style={{ position: 'absolute', top: '30px', left: '8px', right: '8px', bottom: '8px', overflowY: 'auto', overflowX: 'hidden' }} ref={ref}>
      <div style={{ fontSize: 11, padding: '4px 0' }}>
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
  const sum = entries.reduce((a, b) => a + b.value, 0);
  const total = sum || 1;
  const colors = PIE_COLORS;
  const r = size / 2;
  const innerR = Math.max(0, Math.min(r - 2, inner));
  const cx = r, cy = r;
  const svgParts: ReactElement[] = [];
  // Special case: one non-zero segment should render as a full ring
  const nonZero = entries.filter(e => e.value > 0);
  if (sum === 0) {
    if (innerR > 0) {
      const d = `M ${cx + r} ${cy}
                 A ${r} ${r} 0 1 1 ${cx - r} ${cy}
                 A ${r} ${r} 0 1 1 ${cx + r} ${cy}
                 M ${cx + innerR} ${cy}
                 A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy}
                 A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy} Z`;
      svgParts.push(<path key="empty" d={d} fill="var(--color-border)" />);
    } else {
      const d = `M ${cx} ${cy} m -${r}, 0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
      svgParts.push(<path key="empty" d={d} fill="var(--color-border)" />);
    }
  } else if (nonZero.length === 1) {
    const fill = colors[0 % colors.length];
    if (innerR > 0) {
      const d = `M ${cx + r} ${cy}
                 A ${r} ${r} 0 1 1 ${cx - r} ${cy}
                 A ${r} ${r} 0 1 1 ${cx + r} ${cy}
                 M ${cx + innerR} ${cy}
                 A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy}
                 A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy} Z`;
      svgParts.push(<path key="full" d={d} fill={fill} />);
    } else {
      const d = `M ${cx} ${cy} m -${r}, 0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
      svgParts.push(<path key="full" d={d} fill={fill} />);
    }
  } else {
    let acc = 0;
    const data = entries;
    data.forEach((e, i) => {
      const start = (acc / total) * Math.PI * 2;
      acc += e.value;
      const end = (acc / total) * Math.PI * 2;
      const [x1, y1] = [cx + r * Math.cos(start), cy + r * Math.sin(start)];
      const [x2, y2] = [cx + r * Math.cos(end), cy + r * Math.sin(end)];
      const largeArc = end - start > Math.PI ? 1 : 0;
      const fill = colors[i % colors.length];
      if (innerR > 0) {
        const [ix2, iy2] = [cx + innerR * Math.cos(end), cy + innerR * Math.sin(end)];
        const [ix1, iy1] = [cx + innerR * Math.cos(start), cy + innerR * Math.sin(start)];
        const d = `M ${x1} ${y1}
                   A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}
                   L ${ix2} ${iy2}
                   A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1}
                   Z`;
        svgParts.push(<path key={i} d={d} fill={fill} stroke="white" strokeWidth={1} />);
      } else {
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        svgParts.push(<path key={i} d={d} fill={fill} stroke="white" strokeWidth={1} />);
      }
    });
  }
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{svgParts}</svg>
      {innerR > 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div className="ui-sm" style={{ fontWeight: 800 }}>${sum.toFixed(0)}</div>
        </div>
      ) : null}
      {legend && (
        <div className="ui-sm" style={{ display: 'grid', gap: 4, marginTop: 6 }}>
          {entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, background: PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block', borderRadius: 2 }} />
              <span>{e.label}</span>
              <span style={{ marginLeft: 'auto' }}>${e.value.toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PIE_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63'];

function SpendingLegend({ entries }: { entries: Array<{ label: string; value: number; pct: number }> }) {
  return (
    <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
      {entries.map((e, i) => (
        <div key={i}>
          <div className="ui-sm" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, background: PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block', borderRadius: 2 }} />
            <span>{e.label} — ${Number(e.value).toLocaleString()}</span>
          </div>
          <div style={{ height: 10, background: 'var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((e.pct || 0) * 100)}%`, height: '100%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Generic line chart that accepts x/y keys and data arrays
// Removed standalone LineChart for now (unused after placeholder)

// MultiLineChart removed (unused)

// Classify money flow for a given player name from a log entry
// Old text-based classifier removed; aggregation now uses cash deltas per round

// Removed mergeIncomeSpending for now (unused after placeholder)

function extractAmount(txt: string): number {
  const m = txt.match(/\$([\d,]+)/);
  if (!m) return 0;
  try { return parseInt(m[1].replace(/,/g, ''), 10) || 0; } catch { return 0; }
}

// Players Overview intentionally not rendered inside the dashboard drawer per design

type StockSettingsProps = { onClose: () => void; lobbyId: string; snapshot: GameSnapshot; owner: string };
function StockSettingsModal({ onClose, lobbyId, snapshot, owner }: StockSettingsProps) {
  const s = getSocket();
  const row = useMemo(() => (snapshot.stocks || []).find(st => equalNames(st.owner, owner)), [snapshot.stocks, owner]);
  const [allowInvesting, setAllowInvesting] = useState<boolean>(!!row?.allow_investing);
  const [enforceMinBuy, setEnforceMinBuy] = useState<boolean>(!!row?.enforce_min_buy);
  const [minBuy, setMinBuy] = useState<number>(Math.max(0, Number(row?.min_buy || 0)));
  const [enforceMinPoolTotal, setEnforceMinPoolTotal] = useState<boolean>(!!(row?.enforce_min_pool_total ?? row?.enforce_min_pool));
  const [enforceMinPoolOwner, setEnforceMinPoolOwner] = useState<boolean>(!!(row?.enforce_min_pool_owner ?? row?.enforce_min_pool));
  const [minPoolTotal, setMinPoolTotal] = useState<number>(Math.max(0, Number(row?.min_pool_total || 0)));
  const [minPoolOwner, setMinPoolOwner] = useState<number>(Math.max(0, Number(row?.min_pool_owner || 0)));

  const save = () => {
    const payload = {
      type: 'stock_settings',
      owner,
      allow_investing: allowInvesting,
      enforce_min_buy: enforceMinBuy,
      min_buy: Math.max(0, Math.floor(minBuy || 0)),
      // keep legacy flag in sync when either specific pool rules are enabled
      enforce_min_pool: (enforceMinPoolTotal || enforceMinPoolOwner),
      enforce_min_pool_total: enforceMinPoolTotal,
      enforce_min_pool_owner: enforceMinPoolOwner,
      min_pool_total: Math.max(0, Math.floor(minPoolTotal || 0)),
      min_pool_owner: Math.max(0, Math.floor(minPoolOwner || 0)),
    } as any;
    try { s.emit('game_action', { id: lobbyId, action: payload }); } catch {}
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3100 }} onClick={onClose}>
      <div className="dashboard-settings-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: 420, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, boxShadow: 'var(--elev-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="ui-h3">Stock Settings — {normalizeName(owner)}</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="ui-sm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={allowInvesting} onChange={(e) => setAllowInvesting(e.target.checked)} /> Allow others to invest
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
            <label className="ui-sm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={enforceMinBuy} onChange={(e) => setEnforceMinBuy(e.target.checked)} /> Enforce min buy
            </label>
            <input type="number" className="input" min={0} step={25} value={minBuy} onChange={(e) => setMinBuy(parseInt(e.target.value || '0', 10))} style={{ width: 100 }} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="ui-sm" style={{ fontWeight: 700 }}>Pool Minimums</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
              <label className="ui-sm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={enforceMinPoolTotal} onChange={(e) => setEnforceMinPoolTotal(e.target.checked)} /> Enforce pool total ≥
              </label>
              <input type="number" className="input" min={0} step={50} value={minPoolTotal} onChange={(e) => setMinPoolTotal(parseInt(e.target.value || '0', 10))} style={{ width: 120 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
              <label className="ui-sm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={enforceMinPoolOwner} onChange={(e) => setEnforceMinPoolOwner(e.target.checked)} /> Enforce owner stake ≥
              </label>
              <input type="number" className="input" min={0} step={50} value={minPoolOwner} onChange={(e) => setMinPoolOwner(parseInt(e.target.value || '0', 10))} style={{ width: 120 }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type BondSettingsProps = { onClose: () => void; lobbyId: string; snapshot: GameSnapshot; owner: string };
function BondSettingsModal({ onClose, lobbyId, snapshot, owner }: BondSettingsProps) {
  const s = getSocket();
  const row = useMemo(() => (snapshot.bonds || []).find(st => equalNames(st.owner, owner)), [snapshot.bonds, owner]);
  const [allow, setAllow] = useState<boolean>(!!row?.allow_bonds);
  const [rate, setRate] = useState<number>(Math.max(0, Math.min(100, Number(row?.rate_percent || 0))));
  const [period, setPeriod] = useState<number>(Math.max(1, Math.min(20, Number(row?.period_turns || 1))));

  const save = () => {
    const payload = {
      type: 'bond_settings',
      allow_bonds: allow,
      rate_percent: Math.max(0, Math.min(100, rate)),
      period_turns: Math.max(1, Math.min(20, Math.floor(period || 1))),
    } as any;
    try { s.emit('game_action', { id: lobbyId, action: payload }); } catch {}
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3100 }} onClick={onClose}>
      <div className="dashboard-settings-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)', width: 420, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, boxShadow: 'var(--elev-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="ui-h3">Bond Settings — {normalizeName(owner)}</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="ui-sm" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6, background: allow ? 'rgba(39, 174, 96, 0.12)' : 'rgba(231, 76, 60, 0.08)', fontWeight: 700 }}>
            <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
            <span style={{ color: allow ? '#27ae60' : '#c0392b' }}>
              {allow ? 'Bond investments ENABLED' : 'Bond investments DISABLED'}
            </span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
            <label className="ui-sm">Rate %</label>
            <input type="number" className="input" min={0} max={100} step={0.5} value={rate} onChange={(e) => setRate(parseFloat(e.target.value || '0'))} style={{ width: 120 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
            <label className="ui-sm">Period (turns)</label>
            <input type="number" className="input" min={1} max={20} step={1} value={period} onChange={(e) => setPeriod(parseInt(e.target.value || '1', 10))} style={{ width: 120 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type BondInvestProps = { onClose: () => void; lobbyId: string; snapshot: GameSnapshot; owner: string };
function BondTwoPhaseInvestModal({ onClose, lobbyId, snapshot, owner }: BondInvestProps) {
  const s = getSocket();
  const row = (snapshot.bonds || []).find(b => equalNames(b.owner, owner));
  const allow = !!row?.allow_bonds;
  const rate = row?.rate_percent || 0;
  const period = row?.period_turns || 1;
  const [amount, setAmount] = useState<number>(50);
  const [phase, setPhase] = useState<'input' | 'confirm'>('input');
  const presets = [25, 50, 100, 250, 500];
  const ruleErrors: string[] = [];
  if (!allow) ruleErrors.push('Owner has disabled bond investing.');
  if (amount < 1) ruleErrors.push('Amount must be at least 1.');
  const canPreview = ruleErrors.length === 0;
  const projectedCoupon = Math.max(0, Math.floor((amount || 0) * (rate / 100)));
  const doConfirm = () => {
    if (!canPreview) return;
    try { s.emit('game_action', { id: lobbyId, action: { type: 'bond_invest', owner, amount: Math.max(1, Math.floor(amount || 0)) } }); } catch {}
    onClose();
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:3350 }} onClick={onClose}>
      <div className="dashboard-invest-modal" onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:'12%', left:'50%', transform:'translateX(-50%)', width:420, background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:10, padding:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div className="ui-h3">Invest — {normalizeName(owner)} Bonds</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        {phase === 'input' && (
          <div style={{ display:'grid', gap:10 }}>
            <div className="ui-sm">Terms: {rate}% coupon every {period} turn(s)</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {presets.map(p => <button key={p} disabled={!allow} className="btn btn-ghost" onClick={()=>setAmount(p)}>${p}</button>)}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
              <input type="number" className="input" min={1} step={25} value={amount} onChange={e=>setAmount(parseInt(e.target.value||'1',10))} />
              <button className="btn" disabled={!canPreview} onClick={()=>setPhase('confirm')}>Preview</button>
            </div>
            {ruleErrors.length ? (
              <div className="ui-xs" style={{ color:'var(--color-danger)', display:'grid', gap:4 }}>
                {ruleErrors.map((er,i)=>(<div key={i}>• {er}</div>))}
              </div>
            ) : (
              <div className="ui-xs" style={{ opacity:0.75 }}>All checks passed. Preview to confirm.</div>
            )}
          </div>
        )}
        {phase === 'confirm' && (
          <div style={{ display:'grid', gap:10 }}>
            <div className="ui-sm" style={{ fontWeight:700 }}>Preview</div>
            <div className="ui-xs">Amount: ${amount}</div>
            <div className="ui-xs">Projected coupon per period: ${projectedCoupon}</div>
            <div className="ui-xs">First payout in {period} turn(s)</div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={()=>setPhase('input')}>Back</button>
              <button className="btn" disabled={!canPreview} onClick={doConfirm}>Confirm</button>
            </div>
          </div>
        )}
        <div className="ui-xs" style={{ opacity:0.65, marginTop:8 }}>Principal paid now; coupons depend on owner liquidity.</div>
        {!allow && <div className="ui-xs" style={{ color:'var(--color-danger)', marginTop:4 }}>Investing disabled.</div>}
      </div>
    </div>
  );
}

type StockQuickProps = { onClose: () => void; lobbyId: string; snapshot: GameSnapshot; owner: string };
function StockQuickInvestModal({ onClose, lobbyId, snapshot, owner }: StockQuickProps) {
  const s = getSocket();
  const row = (snapshot.stocks || []).find(st => equalNames(st.owner, owner));
  const allow = !!row?.allow_investing;
  const [amount, setAmount] = useState<number>(50);
  const presets = [25, 50, 100, 250, 500];
  const doInvest = (amt: number) => {
    if (!allow) return;
    try { s.emit('game_action', { id: lobbyId, action: { type: 'stock_invest', owner, amount: Math.max(1, Math.floor(amt || 0)) } }); } catch {}
    onClose();
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3200 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '14%', left: '50%', transform: 'translateX(-50%)', width: 420, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, boxShadow: 'var(--elev-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="ui-h3">Invest in {normalizeName(owner)}’s Stock</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        {!allow && <div className="ui-sm" style={{ color: 'var(--color-danger)' }}>Investing is disabled by the owner.</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {presets.map(p => (
            <button key={p} className="btn btn-ghost" disabled={!allow} onClick={() => doInvest(p)}>${p}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <input type="number" className="input" min={1} step={25} value={amount} onChange={(e) => setAmount(parseInt(e.target.value || '1', 10))} />
          <button className="btn" disabled={!allow} onClick={() => doInvest(amount)}>Buy</button>
        </div>
      </div>
    </div>
  );
}

function StockQuickSellModal({ onClose, lobbyId, snapshot, owner }: StockQuickProps) {
  const s = getSocket();
  const me = (getRemembered().displayName || '').trim();
  const row = (snapshot.stocks || []).find(st => equalNames(st.owner, owner));
  const myStake = (row?.holdings || []).find(h => equalNames(h.investor, me));
  const [amount, setAmount] = useState<number>(50);
  const presets = [25, 50, 100, 250, 500];
  const doSell = (amt: number) => {
    try { s.emit('game_action', { id: lobbyId, action: { type: 'stock_sell', owner, amount: Math.max(1, Math.floor(amt || 0)) } }); } catch {}
    onClose();
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3200 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '14%', left: '50%', transform: 'translateX(-50%)', width: 420, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, boxShadow: 'var(--elev-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="ui-h3">Sell {normalizeName(owner)}’s Stock</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="ui-sm" style={{ opacity: 0.85 }}>Your stake: ${Math.max(0, Math.floor((myStake as any)?.shares || 0))}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {presets.map(p => (
            <button key={p} className="btn btn-ghost" onClick={() => doSell(p)}>${p}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <input type="number" className="input" min={1} step={25} value={amount} onChange={(e) => setAmount(parseInt(e.target.value || '1', 10))} />
          <button className="btn" onClick={() => doSell(amount)}>Sell</button>
        </div>
      </div>
    </div>
  );
}

// ================= New Two-Phase Stock Invest/Sell Modals =================
type StockTwoPhaseProps = { owner: string; snapshot: GameSnapshot; lobbyId: string; onClose: () => void };

function computeProjectedOwnership(row: any, investor: string, delta: number, isSell = false) {
  // Option 1 projection logic (pool == owner's current cash):
  //  - Invest: pool increases by amount invested (owner cash grows). All existing dollar stakes stay the same
  //            except the investing player whose stake increases by delta. Percentages dilute.
  //  - Sell: pool SHRINKS by the redeemed amount (owner cash pays out). Seller's dollar stake decreases by delta.
  //          Other investors' dollar stakes and the owner's dollar stake remain unchanged, so their percentages rise.
  if (!row) return { ownerPct: 0, myPct: 0, finalPool: 0, myAfter: 0, appliedDelta: 0, deltaEffective: 0 };

  const currentPool = Math.max(0, Number(row.price || 0)); // server exposes owner cash as price/pool
  const ownerFrac = Math.max(0, Number(row.owner_percent || 0));
  const holdings = Array.isArray(row.holdings) ? row.holdings : [];
  const myRec = holdings.find((h: any) => equalNames(h.investor, investor));
  const myFrac = myRec ? Math.max(0, Number(myRec.percent || 0)) : 0;

  const myDollarBefore = myFrac * currentPool;
  const appliedDelta = isSell ? Math.min(Math.max(0, delta), myDollarBefore) : Math.max(0, delta);

  let poolAfter: number;
  let myDollarAfter: number;
  if (isSell) {
    poolAfter = Math.max(0, currentPool - appliedDelta); // pool shrinks
    myDollarAfter = Math.max(0, myDollarBefore - appliedDelta);
  } else {
    poolAfter = currentPool + appliedDelta; // pool grows
    myDollarAfter = myDollarBefore + appliedDelta;
  }

  const ownerDollar = ownerFrac * currentPool; // owner dollar stake prior; unchanged across both operations
  const basis = poolAfter > 0 ? poolAfter : 1;
  const ownerPct = (ownerDollar / basis) * 100;
  const myPct = (myDollarAfter / basis) * 100;

  return {
    ownerPct: isFinite(ownerPct) ? ownerPct : 0,
    myPct: isFinite(myPct) ? myPct : 0,
    finalPool: basis,
    myAfter: myDollarAfter,
    appliedDelta,
    deltaEffective: appliedDelta,
  };
}

function StockTwoPhaseInvestModal({ owner, snapshot, lobbyId, onClose }: StockTwoPhaseProps) {
  const s = getSocket();
  const me = (getRemembered().displayName || '').trim();
  const row = (snapshot.stocks || []).find(st => equalNames(st.owner, owner));
  const allow = !!row?.allow_investing;
  const [amount, setAmount] = useState<number>(50);
  const [phase, setPhase] = useState<'input' | 'confirm'>('input');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; msg: string }>(null);
  const preset = [25, 50, 100, 250, 500];
  const projection = useMemo(() => computeProjectedOwnership(row, me, amount, false), [row, me, amount]);
  // Validation based on rule settings
  const minBuyEnabled = !!row?.enforce_min_buy;
  const minBuy = Number(row?.min_buy || 0);
  const minPoolTotalEnabled = !!(row?.enforce_min_pool_total ?? row?.enforce_min_pool);
  const minPoolTotal = Number(row?.min_pool_total || 0);
  const minOwnerStakeEnabled = !!(row?.enforce_min_pool_owner ?? row?.enforce_min_pool);
  const minOwnerStake = Number(row?.min_pool_owner || 0);
  const currentPool = Number(row?.price || 0);
  const projectedPool = currentPool + (amount || 0);
  const ownerProjectedStake = projection.ownerPct; // already percent
  const ruleErrors: string[] = [];
  if (!allow) ruleErrors.push('Owner has disabled investing.');
  if (amount < 1) ruleErrors.push('Amount must be at least 1.');
  if (minBuyEnabled && amount < minBuy) ruleErrors.push(`Amount below min buy (${minBuy}).`);
  if (minPoolTotalEnabled && projectedPool < minPoolTotal) ruleErrors.push(`Pool would be below required total (${minPoolTotal}).`);
  if (minOwnerStakeEnabled && ownerProjectedStake < minOwnerStake) ruleErrors.push(`Owner stake would fall below ${minOwnerStake}%.`);
  const canPreview = ruleErrors.length === 0;
  const doConfirm = () => {
    if (!allow || amount < 1) return;
    setSubmitting(true);
    setResult(null);
    const payload = { type: 'stock_invest', owner, amount: Math.max(1, Math.floor(amount || 0)) };
    let interval: number;
    const startPolling = () => {
      const start = Date.now();
      interval = setInterval(() => {
        const la: any = (window as any).__latestSnapshot?.last_action || (snapshot as any).last_action; // fallback
        const t = String(la?.type || '');
        if (t === 'stock_invest' && la.owner === owner && la.by === me) {
          clearInterval(interval);
          setSubmitting(false);
          setResult({ ok: true, msg: `Invested $${amount}` });
          setTimeout(() => onClose(), 400);
        } else if (t === 'stock_invest_denied' && la.by === me) {
          clearInterval(interval);
          setSubmitting(false);
          setResult({ ok: false, msg: `Denied: ${la.reason || 'rules'}` });
        } else if (Date.now() - start > 2000) { // timeout
          clearInterval(interval);
          setSubmitting(false);
          // If we time out, user can manually close; likely still processed but snapshot not yet refreshed
          setResult({ ok: true, msg: 'Submitted' });
          setTimeout(() => onClose(), 600);
        }
      }, 120);
    };
    try { s.emit('game_action', { id: lobbyId, action: payload }, (response: any) => {
      if (response && response.ok === false) {
        setSubmitting(false);
        setResult({ ok: false, msg: `Invest failed: ${response.error || 'Unknown error'}` });
        return;
      }
      // On success, start polling
      startPolling();
    }); } catch (e) { setSubmitting(false); setResult({ ok: false, msg: 'Emit failed' }); return; }
  };
  return (
    <div style={{ position: 'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:3300 }} onClick={onClose}>
      <div className="dashboard-invest-modal" onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:'12%', left:'50%', transform:'translateX(-50%)', width:420, background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:10, padding:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div className="ui-h3">Invest — {normalizeName(owner)}</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        {!allow && <div className="ui-sm" style={{ color:'var(--color-danger)', marginBottom:6 }}>Investing disabled by owner.</div>}
        {phase === 'input' && (
          <div style={{ display:'grid', gap:10 }}>
            <div className="ui-sm">Enter amount to invest:</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {preset.map(p => <button key={p} disabled={!allow} className="btn btn-ghost" onClick={()=>setAmount(p)}>${p}</button>)}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
              <input type="number" className="input" min={1} step={25} value={amount} onChange={e=>setAmount(parseInt(e.target.value||'1',10))} />
              <button className="btn" disabled={!canPreview} onClick={()=>setPhase('confirm')}>Preview</button>
            </div>
            {ruleErrors.length ? (
              <div className="ui-xs" style={{ color:'var(--color-danger)', display:'grid', gap:4 }}>
                {ruleErrors.map((er,i)=>(<div key={i}>• {er}</div>))}
              </div>
            ) : (
              <div className="ui-xs" style={{ opacity:0.75 }}>All rules satisfied. Click Preview.</div>
            )}
          </div>
        )}
        {phase === 'confirm' && (() => {
          const currentPool = Number(row?.price || 0);
          const myRec = (row?.holdings||[]).find((h:any)=>equalNames(h.investor, me));
          const myFracBefore = myRec ? Number(myRec.percent||0) : 0;
          const myDollarBefore = myFracBefore * currentPool;
          const ownerFracBefore = Number(row?.owner_percent||0);
          const ownerDollarBefore = ownerFracBefore * currentPool;
          const poolAfter = projection.finalPool;
          const myDollarAfter = projection.myAfter;
            // Owner dollar stake stays constant in absolute terms under Model B when someone else invests
          const ownerDollarAfter = ownerDollarBefore;
          const ownerPctAfter = projection.ownerPct;
          const myPctAfter = projection.myPct;
          return (
            <div style={{ display:'grid', gap:10 }}>
              <div className="ui-sm" style={{ fontWeight:700 }}>Preview</div>
              <div className="ui-xs" style={{ fontWeight:600 }}>Pool</div>
              <div className="ui-xs">Before: ${currentPool.toLocaleString()} → After: ${Math.round(poolAfter).toLocaleString()}</div>
              <div className="ui-xs" style={{ fontWeight:600 }}>Your Stake</div>
              <div className="ui-xs">${Math.round(myDollarBefore).toLocaleString()} ({(myFracBefore*100).toFixed(2)}%) → ${Math.round(myDollarAfter).toLocaleString()} ({myPctAfter.toFixed(2)}%)</div>
              <div className="ui-xs" style={{ fontWeight:600 }}>Owner Stake</div>
              <div className="ui-xs">${Math.round(ownerDollarBefore).toLocaleString()} ({(ownerFracBefore*100).toFixed(2)}%) → ${Math.round(ownerDollarAfter).toLocaleString()} ({ownerPctAfter.toFixed(2)}%)</div>
              <div className="ui-xs" style={{ opacity:0.7 }}>Option 1: Pool grows by your investment; existing dollar stakes (except yours) stay constant so their percentages dilute.</div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
                <button className="btn btn-ghost" onClick={()=>setPhase('input')}>Back</button>
                <button className="btn" disabled={!allow || submitting} onClick={doConfirm}>{submitting ? 'Sending...' : 'Confirm'}</button>
              </div>
              {result && (
                <div className="ui-xs" style={{ color: result.ok ? '#27ae60' : 'var(--color-danger)' }}>{result.msg}</div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function StockTwoPhaseSellModal({ owner, snapshot, lobbyId, onClose }: StockTwoPhaseProps) {
  const s = getSocket();
  const me = (getRemembered().displayName || '').trim();
  const row = (snapshot.stocks || []).find(st => equalNames(st.owner, owner));
  const [amount, setAmount] = useState<number>(50);
  const [phase, setPhase] = useState<'input' | 'confirm'>('input');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; msg: string }>(null);
  const preset = [25, 50, 100, 250, 500];
  const projection = useMemo(() => computeProjectedOwnership(row, me, amount, true), [row, me, amount]);
  const myStake = (row?.holdings || []).find((h:any)=>equalNames(h.investor, me));
  const currentPool = Number(row?.price || 0);
  const myFrac = myStake ? Number(myStake.percent || 0) : 0;
  const maxSell = Math.max(0, Math.floor(myFrac * currentPool));
  const doConfirm = () => {
    const amt = Math.min(amount, maxSell);
    if (amt < 1) return;
    setSubmitting(true);
    setResult(null);
    const sendAmt = Math.max(1, Math.floor(amt));
    let interval: number;
    const startPolling = () => {
      const start = Date.now();
      interval = setInterval(() => {
        const la: any = (window as any).__latestSnapshot?.last_action || (snapshot as any).last_action;
        const t = String(la?.type || '');
        if (t === 'stock_sell' && la.owner === owner && la.by === me) {
          clearInterval(interval);
          setSubmitting(false); setResult({ ok:true, msg:`Sold $${sendAmt}` });
          setTimeout(()=>onClose(), 400);
        } else if (t === 'stock_sell_denied' && la.by === me) {
          clearInterval(interval);
          setSubmitting(false); setResult({ ok:false, msg:`Denied: ${la.reason||'rules'}` });
        } else if (Date.now() - start > 2000) {
          clearInterval(interval);
          setSubmitting(false); setResult({ ok:true, msg:'Submitted' });
          setTimeout(()=>onClose(), 600);
        }
      }, 120);
    };
    try { s.emit('game_action', { id: lobbyId, action: { type: 'stock_sell', owner, amount: sendAmt } }, (response: any) => {
      if (response && response.ok === false) {
        setSubmitting(false);
        setResult({ ok: false, msg: `Sell failed: ${response.error || 'Unknown error'}` });
        return;
      }
      // On success, start polling
      startPolling();
    }); } catch (e) { setSubmitting(false); setResult({ ok:false, msg:'Emit failed' }); return; }
  };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:3300 }} onClick={onClose}>
      <div className="dashboard-invest-modal" onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:'12%', left:'50%', transform:'translateX(-50%)', width:420, background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:10, padding:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div className="ui-h3">Sell — {normalizeName(owner)}</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="ui-sm">Your current stake: ${maxSell}</div>
        {phase === 'input' && (
          <div style={{ display:'grid', gap:10, marginTop:6 }}>
            <div className="ui-xs">Enter amount to sell (max ${maxSell})</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {preset.map(p => <button key={p} disabled={p>maxSell} className="btn btn-ghost" onClick={()=>setAmount(Math.min(p,maxSell))}>${p}</button>)}
              <button className="btn btn-ghost" disabled={maxSell<1} onClick={()=>setAmount(maxSell)}>Sell All</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
              <input type="number" className="input" min={1} max={maxSell} step={25} value={amount} onChange={e=>setAmount(Math.min(maxSell, parseInt(e.target.value||'1',10)))} />
                <button className="btn" disabled={amount<1} onClick={()=>setPhase('confirm')}>Preview</button>
            </div>
          </div>
        )}
        {phase === 'confirm' && (() => {
          const currentPool = Number(row?.price || 0);
          const myRec = (row?.holdings||[]).find((h:any)=>equalNames(h.investor, me));
          const myFracBefore = myRec ? Number(myRec.percent||0) : 0;
          const myDollarBefore = myFracBefore * currentPool;
          const ownerFracBefore = Number(row?.owner_percent||0);
          const ownerDollarBefore = ownerFracBefore * currentPool;
          const poolAfter = projection.finalPool; // shrinks under Option 1 on sell
          const myDollarAfter = projection.myAfter;
          const ownerDollarAfter = ownerDollarBefore; // owner dollar stake unchanged; percentage increases as pool shrinks
          const ownerPctAfter = projection.ownerPct;
          const myPctAfter = projection.myPct;
          return (
            <div style={{ display:'grid', gap:10, marginTop:6 }}>
              <div className="ui-sm" style={{ fontWeight:700 }}>Preview</div>
              <div className="ui-xs" style={{ fontWeight:600 }}>Pool</div>
              <div className="ui-xs">Before: ${currentPool.toLocaleString()} → After: ${Math.round(poolAfter).toLocaleString()}</div>
              <div className="ui-xs" style={{ fontWeight:600 }}>Your Stake</div>
              <div className="ui-xs">${Math.round(myDollarBefore).toLocaleString()} ({(myFracBefore*100).toFixed(2)}%) → ${Math.round(myDollarAfter).toLocaleString()} ({myPctAfter.toFixed(2)}%)</div>
              <div className="ui-xs" style={{ fontWeight:600 }}>Owner Stake</div>
              <div className="ui-xs">${Math.round(ownerDollarBefore).toLocaleString()} ({(ownerFracBefore*100).toFixed(2)}%) → ${Math.round(ownerDollarAfter).toLocaleString()} ({ownerPctAfter.toFixed(2)}%)</div>
              <div className="ui-xs" style={{ opacity:0.7 }}>Option 1: Pool shrinks by the amount you redeem; remaining investors (and owner) gain relative percent.</div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
                <button className="btn btn-ghost" onClick={()=>setPhase('input')}>Back</button>
                <button className="btn" disabled={amount<1 || submitting} onClick={doConfirm}>{submitting ? 'Sending...' : 'Confirm'}</button>
              </div>
              {result && (<div className="ui-xs" style={{ color: result.ok ? '#27ae60' : 'var(--color-danger)' }}>{result.msg}</div>)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
