import { useEffect, useMemo, useState } from 'react';
import { getSocket, getRemembered } from '../lib/socket';
import { BACKEND_URL, BOARD_META_PATH } from '../config';
import { buildDefaultBoardTiles } from '../lib/boardFallback';
import type { BoardTile, GameSnapshot, PropertyStateLike } from '../types';

type Props = {
  lobbyId: string;
  snapshot: GameSnapshot;
  onClose: () => void;
  variant?: 'properties' | 'advanced';
  initialPartner?: string;
};

export default function TradePanel({ lobbyId, snapshot, onClose, variant = 'properties', initialPartner }: Props) {
  const s = getSocket();
  // Prefer local remembered displayName to avoid mis-identifying "me" when it's not my turn
  const remembered = (getRemembered().displayName || '').trim();
  const fallbackMe = (snapshot.players || []).find(p => p.name === (snapshot as any).me) || snapshot.players?.[snapshot.current_turn];
  const myName = remembered || (fallbackMe?.name || '');
  const [allPlayers, setAllPlayers] = useState<string[]>(() => (snapshot.players || []).map(p => p.name));
  useEffect(() => {
    const onPlayers = (payload: any) => {
      const arr = Array.isArray(payload?.players) ? payload.players : [];
      if (arr.length) setAllPlayers(arr);
    };
    s.on('players_list', onPlayers);
    s.emit('get_players', { id: lobbyId });
    return () => { s.off('players_list', onPlayers); };
  }, [s, lobbyId]);
  const others = allPlayers.filter(n => n && n !== myName).map(name => ({ name } as any));
  const [counterparty, setCounterparty] = useState<string>(initialPartner || others[0]?.name || '');
  const [giveCash, setGiveCash] = useState<number>(0);
  const [receiveCash, setReceiveCash] = useState<number>(0);
  const [giveProps, setGiveProps] = useState<Set<number>>(new Set());
  const [receiveProps, setReceiveProps] = useState<Set<number>>(new Set());
  const [giveJailCard, setGiveJailCard] = useState<boolean>(false);
  const [receiveJailCard, setReceiveJailCard] = useState<boolean>(false);
  const [tiles, setTiles] = useState<BoardTile[]>([]);
  const [err, setErr] = useState<string>('');
  // Advanced terms: per-turn payments
  const [advPayments, setAdvPayments] = useState<Array<{ from: 'me' | 'them', amount: number, turns: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setErr('');
  const bases = [BACKEND_URL || '', 'http://127.0.0.1:8000'];
      for (const base of bases) {
        try {
          const url = base ? `${base}${BOARD_META_PATH}` : BOARD_META_PATH;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) continue;
          const data = await res.json();
          const arr = Array.isArray(data) ? data : (Array.isArray(data?.tiles) ? data.tiles : null);
          if (!cancelled && arr) { setTiles(arr as BoardTile[]); return; }
        } catch {}
      }
      if (!cancelled) {
        setErr('Board metadata unavailable (using fallback)');
        setTiles(buildDefaultBoardTiles());
      }
    }
    load();
    return () => { cancelled = true };
  }, []);

  const props = snapshot.properties || {} as Record<string | number, PropertyStateLike>;
  const ownedBy = (name: string) => new Set(
    Object.entries(props)
      .filter(([_pos, st]) => (st as any)?.owner === name)
      .map(([pos]) => Number(pos))
  );
  const mineOwned = useMemo(() => ownedBy(myName), [props, myName]);
  const theirOwned = useMemo(() => ownedBy(counterparty), [props, counterparty]);

  const propertyList = useMemo(
    () => tiles.filter(t => ['property', 'railroad', 'utility'].includes((t.type || '').toString())),
    [tiles]
  );
  const allowJail = variant === 'advanced';
  const myOfferValid = giveCash > 0 || giveProps.size > 0 || (allowJail && giveJailCard);
  const theirOfferValid = receiveCash > 0 || receiveProps.size > 0 || (allowJail && receiveJailCard);
  const canSend = !!counterparty && (myOfferValid || theirOfferValid);

  function sendOffer() {
    if (!canSend) return;
    const terms = variant === 'advanced' ? {
      payments: advPayments.filter(p => p.amount > 0 && p.turns > 0).map(p => ({
        from: p.from === 'me' ? myName : counterparty,
        to: p.from === 'me' ? counterparty : myName,
        amount: p.amount,
        turns: p.turns,
      }))
    } : undefined;
    s.emit('game_action', {
      id: lobbyId,
      action: {
        type: 'offer_trade',
        to: counterparty,
        give: { cash: giveCash, properties: Array.from(giveProps), jail_card: giveJailCard },
        receive: { cash: receiveCash, properties: Array.from(receiveProps), jail_card: receiveJailCard },
        terms,
      }
    });
    onClose();
  }

  const last = snapshot.last_action as any;
  const incomingOffer = last && last.type === 'trade_offer' && last.to === myName ? last : null;

  function acceptOffer() {
    if (!incomingOffer) return;
    s.emit('game_action', { id: lobbyId, action: { type: 'accept_trade', trade_id: incomingOffer.id, offer: incomingOffer } });
  }
  function declineOffer() {
    if (!incomingOffer) return;
    s.emit('game_action', { id: lobbyId, action: { type: 'decline_trade', trade_id: incomingOffer.id } });
  }

  const renderPropItem = (t: BoardTile, selected: boolean, toggle: () => void, owned: boolean) => (
    <label key={t.pos} style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: owned ? 1 : 0.35 }}>
      <input type="checkbox" checked={selected} onChange={toggle} disabled={!owned} />
      <span style={{ width: 10, height: 10, background: t.color || 'transparent', border: '1px solid #bbb', display: 'inline-block' }} />
      <span style={{ fontSize: 12 }}>{t.name || `Tile ${t.pos}`}</span>
    </label>
  );

  return (
    <div className="trade-panel" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', minWidth: 720, maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto', borderRadius: 8, padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{variant === 'advanced' ? '⚡ Advanced Combined Trade' : '🤝 Trade Properties'}</h3>
          <button className="btn btn-ghost" onClick={onClose}>❌ Close</button>
        </div>
        {err ? <div style={{ color: '#e74c3c', fontSize: 12, marginTop: 6 }}>{err}</div> : null}
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12 }}>With
            <select value={counterparty} onChange={(e) => setCounterparty(e.target.value)} style={{ marginLeft: 8 }}>
              {others.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
          <div className="ui-labelframe">
            <div className="ui-title ui-h3">📤 Your Offer {myName ? `(${myName})` : ''}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>Cash
                <input type="number" min={0} value={giveCash} onChange={(e) => setGiveCash(parseInt(e.target.value || '0', 10))} style={{ width: 100, marginLeft: 6 }} />
              </label>
              {allowJail ? (
                <label style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={giveJailCard} onChange={(e) => setGiveJailCard(e.target.checked)} /> Get Out of Jail Free
                </label>
              ) : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, maxHeight: 240, overflow: 'auto', paddingRight: 4 }}>
              {propertyList.filter(t => mineOwned.has(t.pos)).map((t) => renderPropItem(
                t,
                giveProps.has(t.pos),
                () => setGiveProps(prev => { const n = new Set(prev); if (n.has(t.pos)) n.delete(t.pos); else n.add(t.pos); return n; }),
                true
              ))}
            </div>
          </div>

          <div className="ui-labelframe">
            <div className="ui-title ui-h3">📥 Partner's Offer {counterparty ? `(${counterparty})` : ''}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>Cash
                <input type="number" min={0} value={receiveCash} onChange={(e) => setReceiveCash(parseInt(e.target.value || '0', 10))} style={{ width: 100, marginLeft: 6 }} />
              </label>
              {allowJail ? (
                <label style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={receiveJailCard} onChange={(e) => setReceiveJailCard(e.target.checked)} /> Get Out of Jail Free
                </label>
              ) : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, maxHeight: 240, overflow: 'auto', paddingRight: 4 }}>
              {propertyList.filter(t => theirOwned.has(t.pos)).map((t) => renderPropItem(
                t,
                receiveProps.has(t.pos),
                () => setReceiveProps(prev => { const n = new Set(prev); if (n.has(t.pos)) n.delete(t.pos); else n.add(t.pos); return n; }),
                true
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button className="btn btn-primary" onClick={sendOffer} disabled={!canSend}>➕ Create New Trade</button>
          {!canSend ? <span style={{ fontSize: 12, opacity: 0.8 }}>Select a player and include cash or at least one property</span> : null}
        </div>

        {variant === 'advanced' ? (
          <div className="ui-labelframe" style={{ marginTop: 12 }}>
            <div className="ui-title ui-h3">📆 Per-turn Payments</div>
            <div style={{ fontSize: 12, margin: '6px 0' }}>Add recurring payments that trigger at the payer's end of turn.</div>
            <AdvPaymentsEditor
              payments={advPayments}
              setPayments={setAdvPayments}
              myName={myName}
              counterparty={counterparty}
            />
          </div>
        ) : null}

        {incomingOffer ? (
          <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>📊 Trade Details</div>
            <div style={{ fontSize: 12, marginBottom: 6 }}>They give: ${incomingOffer.give?.cash || 0}, properties: {(incomingOffer.give?.properties || []).join(', ')}, jail card: {incomingOffer.give?.jail_card ? 'yes' : 'no'}</div>
            <div style={{ fontSize: 12, marginBottom: 6 }}>You give: ${incomingOffer.receive?.cash || 0}, properties: {(incomingOffer.receive?.properties || []).join(', ')}, jail card: {incomingOffer.receive?.jail_card ? 'yes' : 'no'}</div>
            {incomingOffer.terms?.payments?.length ? (
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                Recurring payments:
                <ul>
                  {incomingOffer.terms.payments.map((p: any, i: number) => (
                    <li key={i}>{p.from} pays ${p.amount} to {p.to} for {p.turns} turns</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-success" onClick={acceptOffer} disabled={incomingOffer.to !== myName}>✅ Accept Trade</button>
              <button className="btn btn-danger" onClick={declineOffer}>❌ Reject Trade</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AdvPaymentsEditor({ payments, setPayments, myName, counterparty }: {
  payments: Array<{ from: 'me' | 'them', amount: number, turns: number }>;
  setPayments: (p: Array<{ from: 'me' | 'them', amount: number, turns: number }>) => void;
  myName: string;
  counterparty: string;
}) {
  const add = () => setPayments([...payments, { from: 'me', amount: 10, turns: 3 }]);
  const update = (i: number, patch: Partial<{ from: 'me' | 'them', amount: number, turns: number }>) => {
    const next = payments.slice();
    next[i] = { ...next[i], ...patch } as any;
    setPayments(next);
  };
  const remove = (i: number) => setPayments(payments.filter((_, idx) => idx !== i));
  return (
    <div>
      {payments.length === 0 ? <div className="ui-sm" style={{ opacity: 0.75 }}>No recurring payments added.</div> : null}
      {payments.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <select value={p.from} onChange={(e) => update(i, { from: (e.target.value as any) })}>
            <option value="me">{myName || 'Me'} pays</option>
            <option value="them">{counterparty || 'Partner'} pays</option>
          </select>
          <label style={{ fontSize: 12 }}>amount
            <input type="number" min={1} value={p.amount} onChange={(e) => update(i, { amount: parseInt(e.target.value || '0', 10) })} style={{ width: 90, marginLeft: 6 }} />
          </label>
          <label style={{ fontSize: 12 }}>turns
            <input type="number" min={1} value={p.turns} onChange={(e) => update(i, { turns: parseInt(e.target.value || '0', 10) })} style={{ width: 90, marginLeft: 6 }} />
          </label>
          <button className="btn btn-ghost" onClick={() => remove(i)}>🗑️</button>
        </div>
      ))}
      <button className="btn" onClick={add}>➕ Add payment</button>
    </div>
  );
}
