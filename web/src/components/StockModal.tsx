import { useEffect, useMemo, useState } from 'react';
import { getSocket, getRemembered } from '../lib/socket';
import type { GameSnapshot } from '../types';

type StockHolding = { investor: string; shares: number; percent?: number };
type StockRow = {
  owner: string;
  owner_color?: string | null;
  price: number;
  total_shares: number;
  min_buy: number;
  min_pool_total?: number;
  min_pool_owner?: number;
  allow_investing?: boolean;
  enforce_min_buy?: boolean;
  enforce_min_pool?: boolean; // legacy combined gate (keep reading for fallback)
  enforce_min_pool_total?: boolean;
  enforce_min_pool_owner?: boolean;
  base?: number;
  owner_percent?: number;
  holdings: StockHolding[];
};

type Props = {
  open: boolean;
  lobbyId: string;
  snapshot: GameSnapshot;
  stock: StockRow | null;
  onClose: () => void;
};

export default function StockModal({ open, lobbyId, snapshot, stock, onClose }: Props) {
  const s = getSocket();
  const myName = (getRemembered().displayName || '').trim();
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [sellMode, setSellMode] = useState<'percent' | 'cash'>('percent');
  const [buyAmt, setBuyAmt] = useState<number>(0);
  const [sellPct, setSellPct] = useState<number>(100);
  const [sellAmt, setSellAmt] = useState<number>(0);
  const [minBuy, setMinBuy] = useState<number>(0);
  const [allowInvesting, setAllowInvesting] = useState<boolean>(true);
  const [enforceMinBuy, setEnforceMinBuy] = useState<boolean>(false);
  // Split gates (new). We still accept legacy enforce_min_pool for fallback.
  const [enforceMinPoolTotal, setEnforceMinPoolTotal] = useState<boolean>(false);
  const [enforceMinPoolOwner, setEnforceMinPoolOwner] = useState<boolean>(false);
  const [minPoolTotal, setMinPoolTotal] = useState<number>(0);
  const [minPoolOwner, setMinPoolOwner] = useState<number>(0);

  useEffect(() => {
    if (!open) { setBuyAmt(0); setSellPct(100); setSellAmt(0); setTab('buy'); setSellMode('percent'); }
  }, [open]);
  useEffect(() => {
    if (stock) setMinBuy(stock.min_buy || 0);
    if (stock) setMinPoolTotal(stock.min_pool_total || 0);
    if (stock) setMinPoolOwner(stock.min_pool_owner || 0);
    if (stock) setAllowInvesting((stock as any).allow_investing ?? true);
    if (stock) setEnforceMinBuy((stock as any).enforce_min_buy ?? false);
    if (stock) {
      const legacy = (stock as any).enforce_min_pool ?? false;
      setEnforceMinPoolTotal((stock as any).enforce_min_pool_total ?? legacy ?? false);
      setEnforceMinPoolOwner((stock as any).enforce_min_pool_owner ?? legacy ?? false);
    }
  }, [stock]);

  const ownerPlayer = useMemo(() => (snapshot.players || []).find(p => p.name === stock?.owner), [snapshot.players, stock?.owner]);
  const myPlayer = useMemo(() => (snapshot.players || []).find(p => p.name === myName), [snapshot.players, myName]);
  const myCash = myPlayer?.cash || 0;

  const myHolding = useMemo(() => {
    const h = (stock?.holdings || []).find(hh => hh.investor === myName);
    return { shares: h?.shares || 0, percent: Math.max(0, Math.min(1, h?.percent ?? 0)) };
  }, [stock, myName]);

  const base = Math.max(10, stock?.base || stock?.total_shares || 10);
  const P = Math.max(0, ownerPlayer?.cash || 0); // owner's cash is the pool
  // Price always mirrors owner's current cash (pool) with floor 1 for stability.
  const price = Math.max(1, ownerPlayer?.cash ?? 1);
  // Percent-of-pool previews
  const pCur = Math.max(0, Math.min(1, myHolding.percent));
  const E = pCur * P;
  // Buy preview: p' = (E + A) / (P + A)
  const A = Math.max(0, Math.floor(buyAmt || 0));
  const newMyPercentBuy = A > 0 ? ((E + A) / (P + A)) : pCur;
  // Sell preview: choose S based on mode, clamp by E and owner cash
  const requestedS = sellMode === 'percent'
    ? Math.max(0, Math.min(100, sellPct)) / 100 * E
    : Math.max(0, Math.floor(sellAmt || 0));
  const S_clamped_by_stake = Math.min(E, requestedS);
  const ownerCash = P;
  const S = Math.min(ownerCash, S_clamped_by_stake);
  const newPoolAfterSell = Math.max(0, P - S);
  const newStakeAfterSell = Math.max(0, E - S);
  const newMyPercentSell = newPoolAfterSell > 0 ? (newStakeAfterSell / newPoolAfterSell) : 0;

  function invest() {
    if (!stock) return;
    const amount = Math.max(0, Math.floor(buyAmt));
    if (amount <= 0) return;
    s.emit('game_action', { id: lobbyId, action: { type: 'stock_invest', owner: stock.owner, amount } });
    onClose();
  }
  function sell() {
    if (!stock) return;
    if (sellMode === 'percent') {
      const percent = Math.max(0, Math.min(1, (sellPct || 0) / 100));
      if (percent <= 0) return;
      s.emit('game_action', { id: lobbyId, action: { type: 'stock_sell', owner: stock.owner, percent } });
      onClose();
    } else {
      const amount = Math.max(0, Math.floor(sellAmt));
      if (amount <= 0) return;
      s.emit('game_action', { id: lobbyId, action: { type: 'stock_sell', owner: stock.owner, amount } });
      onClose();
    }
  }

  function clamp01(v: number) { return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
  function formatPercent(p: number | undefined | null) {
    const x = clamp01(p || 0) * 100;
    if (x >= 10) return Math.round(x).toString() + '%'; // whole numbers for large values
    if (x >= 1) return x.toFixed(2) + '%';               // two decimals for 1% - 9.99%
    if (x >= 0.01) return x.toFixed(3) + '%';            // more precision for small stakes
    if (x > 0) return '<0.01%';
    return '0%';
  }

  if (!open || !stock) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={onClose}>
  <div className="card" style={{ background: 'var(--color-surface)', width: 'min(720px, 92vw)', borderRadius: 10, padding: 14, boxShadow: '0 10px 30px var(--color-shadow)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span title={stock.owner} style={{ width: 12, height: 12, borderRadius: '50%', background: stock.owner_color || '#999', display: 'inline-block' }} />
            <h3 style={{ margin: 0 }}>{stock.owner} Stock</h3>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>❌ Close</button>
        </div>
  <div className="ui-sm" style={{ marginTop: 6, opacity: 0.9 }}>Price ${price} • Base {base} • Total {stock.total_shares} • Min buy ${stock.min_buy}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div className="ui-labelframe">
            <div className="ui-title ui-h3">📊 Ownership</div>
            <div className="ui-sm" style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto', marginTop: 6 }}>
              {stock.holdings.length === 0 ? <div style={{ opacity: 0.7 }}>No outside investors yet</div> : stock.holdings.map((h) => (
                <div key={h.investor} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{h.investor}</span>
                  <span>{formatPercent(h.percent)} ({h.shares} sh)</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #eee', paddingTop: 6 }}>
                <strong>Owner</strong>
                <span>{formatPercent(stock.owner_percent ?? Math.max(0, 1 - stock.holdings.reduce((a, b) => a + (b.percent || 0), 0)))}</span>
              </div>
            </div>
          </div>
          <div className="ui-labelframe">
            <div className="ui-title ui-h3">🧍 You</div>
            <div className="ui-sm" style={{ display: 'grid', gap: 6, marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cash</span><strong>${myCash}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Holdings</span><strong>{formatPercent(myHolding.percent)} ({myHolding.shares} sh)</strong></div>
            </div>
    {myName === stock.owner ? (
              <div className="ui-labelframe" style={{ marginTop: 10 }}>
                <div className="ui-title ui-h4">Owner Settings</div>
                <div className="ui-sm" style={{ display: 'grid', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={allowInvesting} onChange={(e) => setAllowInvesting(e.target.checked)} /> Allow Investing
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={enforceMinBuy} onChange={(e) => setEnforceMinBuy(e.target.checked)} /> Enforce Minimum Buy-in
                    <span>Min Buy $<input type="number" min={0} value={minBuy} onChange={(e) => setMinBuy(parseInt(e.target.value || '0', 10))} style={{ width: 110, marginLeft: 4 }} /></span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={enforceMinPoolTotal} onChange={(e) => setEnforceMinPoolTotal(e.target.checked)} /> Min Total Pool Gate
                    <span style={{ opacity: enforceMinPoolTotal ? 1 : 0.6 }}>≥ $<input disabled={!enforceMinPoolTotal} type="number" min={0} value={minPoolTotal} onChange={(e) => setMinPoolTotal(parseInt(e.target.value || '0', 10))} style={{ width: 120, marginLeft: 4 }} /></span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={enforceMinPoolOwner} onChange={(e) => setEnforceMinPoolOwner(e.target.checked)} /> Min Owner Stake Gate
                    <span style={{ opacity: enforceMinPoolOwner ? 1 : 0.6 }}>≥ $<input disabled={!enforceMinPoolOwner} type="number" min={0} value={minPoolOwner} onChange={(e) => setMinPoolOwner(parseInt(e.target.value || '0', 10))} style={{ width: 120, marginLeft: 4 }} /></span>
                  </label>
                  <div>
                    <button className="btn btn-ghost" onClick={() => { s.emit('game_action', { id: lobbyId, action: { type: 'stock_settings', owner: stock.owner, allow_investing: allowInvesting, enforce_min_buy: enforceMinBuy, min_buy: Math.max(0, Math.floor(minBuy || 0)), enforce_min_pool: (enforceMinPoolTotal || enforceMinPoolOwner), enforce_min_pool_total: enforceMinPoolTotal, enforce_min_pool_owner: enforceMinPoolOwner, min_pool_total: Math.max(0, Math.floor(minPoolTotal || 0)), min_pool_owner: Math.max(0, Math.floor(minPoolOwner || 0)) } }); }}>Save</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ui-labelframe" style={{ marginTop: 10 }}>
                <div className="ui-title ui-h4">Rules</div>
                {(() => {
                  const legacy = (stock as any).enforce_min_pool;
                  const totalGate = (stock as any).enforce_min_pool_total ?? legacy;
                  const ownerGate = (stock as any).enforce_min_pool_owner ?? legacy;
                  return (
                    <div className="ui-sm" style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Investing</span><strong>{(stock as any).allow_investing === false ? 'Disabled' : 'Allowed'}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Min Buy</span><strong>{(stock as any).enforce_min_buy ? `$${stock.min_buy}` : 'None'}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Pool Gate</span><strong>{totalGate ? `$${stock.min_pool_total}` : '—'}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Owner Stake Gate</span><strong>{ownerGate ? `$${stock.min_pool_owner}` : '—'}</strong></div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
        {myName !== stock.owner && (
          <>
            <div className="ui-tabs" style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <button className={`btn ${tab === 'buy' ? '' : 'btn-ghost'}`} onClick={() => setTab('buy')}>Buy</button>
              <button className={`btn ${tab === 'sell' ? '' : 'btn-ghost'}`} onClick={() => setTab('sell')}>Sell</button>
            </div>
            {tab === 'buy' ? (
              <div className="ui-labelframe" style={{ marginTop: 8 }}>
                <div className="ui-title ui-h3">Buy</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <label className="ui-sm">Amount $<input type="number" min={0} value={buyAmt} onChange={(e) => setBuyAmt(parseInt(e.target.value || '0', 10))} style={{ width: 120, marginLeft: 4 }} /></label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[25, 50, 100, 200].map(v => <button key={v} className="btn btn-ghost" onClick={() => setBuyAmt(Math.min(myCash, Math.max(0, (buyAmt || 0) + v)))}>+${v}</button>)}
                    <button className="btn btn-ghost" onClick={() => setBuyAmt(myCash)}>All</button>
                  </div>
                </div>
                <div className="ui-sm" style={{ marginTop: 6, opacity: 0.9 }}>
                  You’ll invest <strong>${A}</strong>. New ownership: <strong>{formatPercent(newMyPercentBuy)}</strong>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={invest} disabled={A <= 0 || A > myCash || (((stock as any).enforce_min_buy ?? false) && A < (stock.min_buy || 0)) || (((stock as any).allow_investing === false))}>Confirm Buy</button>
                  {((stock as any).allow_investing === false) && <span className="ui-sm" style={{ marginLeft: 8, color: '#c0392b' }}>Investing disabled by owner</span>}
                </div>
              </div>
            ) : (
              <div className="ui-labelframe" style={{ marginTop: 8 }}>
                <div className="ui-title ui-h3">Sell</div>
                <div className="ui-sm" style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                  <label><input type="radio" name="sellmode" checked={sellMode === 'percent'} onChange={() => setSellMode('percent')} /> Percent</label>
                  <label><input type="radio" name="sellmode" checked={sellMode === 'cash'} onChange={() => setSellMode('cash')} /> Cash</label>
                </div>
                {sellMode === 'percent' ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                    <label className="ui-sm">Percent %<input type="number" min={1} max={100} value={sellPct} onChange={(e) => setSellPct(Math.max(1, Math.min(100, parseInt(e.target.value || '0', 10))))} style={{ width: 120, marginLeft: 4 }} /></label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[10, 25, 50, 100].map(v => <button key={v} className="btn btn-ghost" onClick={() => setSellPct(v)}>{v}%</button>)}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                    <label className="ui-sm">Amount $<input type="number" min={0} value={sellAmt} onChange={(e) => setSellAmt(parseInt(e.target.value || '0', 10))} style={{ width: 120, marginLeft: 4 }} /></label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[25, 50, 100, 200].map(v => <button key={v} className="btn btn-ghost" onClick={() => setSellAmt(Math.max(0, (sellAmt || 0) + v))}>+${v}</button>)}
                      <button className="btn btn-ghost" onClick={() => setSellAmt(Math.floor(E))}>All</button>
                    </div>
                  </div>
                )}
                <div className="ui-sm" style={{ marginTop: 6, opacity: 0.9 }}>
                  You’ll redeem <strong>${Math.floor(S)}</strong>.
                  {S < S_clamped_by_stake ? <span style={{ color: '#c0392b' }}> Limited by owner cash: pays ${Math.floor(S)}</span> : null}
                </div>
                <div className="ui-sm" style={{ marginTop: 4, opacity: 0.9 }}>
                  New ownership: <strong>{formatPercent(newMyPercentSell)}</strong>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={sell} disabled={S <= 0 || E <= 0}>Confirm Sell</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
