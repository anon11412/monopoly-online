import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { LineChart as RCLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { GameSnapshot } from '../types';
import { getSocket, getRemembered } from '../lib/socket';
import { normalizeName, equalNames } from '../lib/names';
import ChatPanel from './ChatPanel';

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
        if (t === 'trade_cash' || t === 'rental_upfront' || t === 'recurring' || t === 'stock_invest' || t === 'stock_sell' || t === 'bond_invest' || t === 'bond_coupon') {
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
            <div style={{ position: 'relative', minHeight: 0, paddingRight: 180, paddingBottom: 12 }}>
              <SpendingLegend entries={spendingAgg} />
              <div style={{ position: 'absolute', right: 6, bottom: -22, width: 160, height: 160, pointerEvents: 'none' }}>
                <PieChart entries={spendingAgg} size={140} inner={50} legend={false} />
              </div>
            </div>
          </div>
        </div>
        {/* Bottom: Payments + Rentals summary */}
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
        <div className="ui-h3" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Stocks</span>
          {myName ? (
            <button className="btn btn-ghost" onClick={() => setShowStockSettings(true)} style={{ padding: '2px 8px', fontSize: 12 }}>Settings</button>
          ) : null}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(200px, 1fr)', gap: 10, minHeight: 0, overflowY: 'auto' }}>
          {stocksByOwner.map((row: any, i: number) => {
            const isMine = row?.owner && myName && equalNames(row.owner, myName);
            const allowInvest = !!row?.allow_investing;
            const myHolding = (row?.holdings || []).find((h: any) => myName && equalNames(h.investor, myName));
            return (
              <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row ? normalizeName(row.owner) : `Stock ${i + 1}`}</div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  {row?.history && row.history.length ? (
                    <ResponsiveContainer width="100%" height={140}>
                      <RCLineChart data={row.history} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                        <XAxis dataKey="turn" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={(v:number)=>`$${Number(v).toLocaleString()}`} tick={{ fontSize: 10 }} width={52} />
                        <Tooltip formatter={(v:any)=>`$${Number(v).toLocaleString()}`} labelFormatter={(l:any)=>`Round ${l}`} />
                        <Line type="monotone" dataKey="pool" stroke="#2980b9" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </RCLineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Sparkline height={140} showAxes />
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(200px, 1fr)', gap: 10, minHeight: 0, overflowY: 'auto' }}>
            {bondsByOwner.map((row: any, i: number) => {
              const isMine = row?.owner && myName && equalNames(row.owner, myName);
              return (
                <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row ? normalizeName(row.owner) : `Bond ${i + 1}`}</div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    {row?.history && row.history.length ? (
                      <ResponsiveContainer width="100%" height={140}>
                        <RCLineChart data={row.history} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                          <XAxis dataKey="turn" tick={{ fontSize: 10 }} />
                          {(() => {
                            const hist = Array.isArray(row?.history) ? row.history as Array<{turn:number; rate:number}> : [];
                            const vals = hist.map(h => Number(h.rate || 0)).filter(v => Number.isFinite(v));
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
                            const step = range / 4;
                            const toPct = (v:number) => `${Number(v).toFixed(range < 2 ? 1 : 0)}%`;
                            return (
                              <YAxis domain={[ymin, ymax]} tickCount={5} interval={0} tickFormatter={toPct} tick={{ fontSize: 10 }} width={40} allowDataOverflow />
                            );
                          })()}
                          <Tooltip formatter={(v:any)=>`${Number(v).toFixed(2)}%`} labelFormatter={(l:any)=>`Round ${l}`} />
                          <Line type="monotone" dataKey="rate" stroke="#8e44ad" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </RCLineChart>
                      </ResponsiveContainer>
                    ) : (
                      <Sparkline height={140} showAxes />
                    )}
                  </div>
                  {row ? (
                    <div className="ui-xs" style={{ marginTop: 6, opacity: 0.8 }}>Rate {row.rate_percent || 0}% • Every {row.period_turns || 1}t</div>
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
        <BondInvestModal
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
    </div>
  );
}

// ChatPanel now shared in ./ChatPanel

function GameLogPanel({ snapshot }: { snapshot: GameSnapshot }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [snapshot?.log]);
  // Filter to only money-in/out and feature state changes
  const items = ((snapshot?.log || []) as any[]).filter((e: any) => {
    const t = String(e.type || '').toLowerCase();
    if (t === 'rent' || t === 'recurring_pay' || t === 'rental_created') return true;
    if (t === 'bond_invest' || t === 'bond_coupon' || t === 'stock_invest' || t === 'stock_sell') return true;
    if (t === 'bond_settings' || t === 'stock_settings' || t === 'auto_mortgage') return true;
    if (t === 'trade_accepted') return true;
    return false;
  }).slice(-80);
  const icon = (t: string) => {
    const m: Record<string, string> = {
      rolled: '🎲',
      buy: '�',
      buy_house: '🏚️',
      sell_house: '🏚️',
      buy_hotel: '🏨',
      sell_hotel: '🏨',
      mortgage: '🏦',
      unmortgage: '�',
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
      bond_invest: '💰',
      bond_coupon: '💵',
      auto_mortgage: '⚙️',
      card: '🎴',
      card_draw: '🃏',
      game_over: '🏁',
      bankrupt: '💥',
      disconnect_kick: '�',
      debt_unpaid: '❗',
    };
    return m[t] || '•';
  };
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
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: 420, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, boxShadow: 'var(--elev-4)' }}>
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
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)', width: 420, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, boxShadow: 'var(--elev-4)' }}>
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
function BondInvestModal({ onClose, lobbyId, snapshot, owner }: BondInvestProps) {
  const s = getSocket();
  const me = (getRemembered().displayName || '').trim();
  const bonds = snapshot.bonds || [];
  const row = bonds.find(b => equalNames(b.owner, owner));
  const allow = !!row?.allow_bonds;
  const rate = row?.rate_percent || 0;
  const period = row?.period_turns || 1;
  const [amount, setAmount] = useState<number>(50);
  const presets = [25, 50, 100, 250, 500];

  const doInvest = (amt: number) => {
    if (!allow) return;
    try { s.emit('game_action', { id: lobbyId, action: { type: 'bond_invest', owner, amount: Math.max(1, Math.floor(amt || 0)) } }); } catch {}
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3200 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '14%', left: '50%', transform: 'translateX(-50%)', width: 420, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, boxShadow: 'var(--elev-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="ui-h3">Invest in {normalizeName(owner)}’s Bonds</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="ui-sm" style={{ opacity: 0.9 }}>Terms: {rate}% coupon every {period} turn(s)</div>
          {!allow && (
            <div className="ui-sm" style={{ color: 'var(--color-danger)' }}>Investing is disabled. Ask owner to enable in Settings.</div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {presets.map(p => (
              <button key={p} className="btn btn-ghost" disabled={!allow} onClick={() => doInvest(p)}>${p}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
            <input type="number" className="input" min={1} step={25} value={amount} onChange={(e) => setAmount(parseInt(e.target.value || '1', 10))} />
            <button className="btn" disabled={!allow} onClick={() => doInvest(amount)}>Buy</button>
          </div>
          <div className="ui-xs" style={{ opacity: 0.8 }}>Projected return next coupon: ${Math.max(0, Math.floor((amount || 0) * (rate / 100)))} (if invested before owner’s next payout)</div>
          <div className="ui-xs" style={{ opacity: 0.7 }}>You: {normalizeName(me)}. Owner receives your principal immediately; coupons paid by owner every {period} turn(s).</div>
        </div>
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
