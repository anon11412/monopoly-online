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
  // Advanced terms: rental agreements
  const [rentalAgreements, setRentalAgreements] = useState<Array<{ properties: number[], percentage: number, turns: number, direction: 'give' | 'receive' }>>([]);

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
      })),
      rentals: rentalAgreements.filter(r => r.properties.length > 0 && r.percentage > 0 && r.turns > 0).map(r => ({
        properties: r.properties,
        percentage: r.percentage,
        turns: r.turns,
        direction: r.direction, // 'give' means I'm giving rental rights, 'receive' means I'm getting rental rights
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
    }, (ack: any) => {
      try { console.debug('[TRADE][OFFER][ACK]', ack); } catch {}
    });
    if (variant === 'advanced') {
      onClose();
    } else {
      // Reset form for rapid consecutive offers while keeping panel open (live updates)
      setGiveCash(0); setReceiveCash(0); setGiveProps(new Set()); setReceiveProps(new Set()); setGiveJailCard(false); setReceiveJailCard(false); setAdvPayments([]); setRentalAgreements([]);
    }
  }

  // Determine the most relevant incoming offer for the quick accept/decline header.
  // Previously this only looked at last_action; if any other action happened after a trade
  // offer (e.g. rent payment, dice roll) the buttons disappeared even though the trade
  // remained pending. We now fallback to the newest pending trade directed at me.
  const incomingOffer = useMemo(() => {
    const last = snapshot.last_action as any;
    if (last && last.type === 'trade_offer' && last.to === myName) return last;
    const list: any[] = (snapshot as any)?.pending_trades || [];
    const mine = list.filter(o => o && o.to === myName);
    if (mine.length === 0) return null;
    return mine[mine.length - 1]; // most recent
  }, [snapshot, myName]);

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
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setGiveCash(prev => prev + 25)} disabled={giveCash + 25 > 5000}>+25</button>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setGiveCash(prev => prev + 50)} disabled={giveCash + 50 > 5000}>+50</button>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setGiveCash(prev => prev + 100)} disabled={giveCash + 100 > 5000}>+100</button>
              </div>
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
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setReceiveCash(prev => prev + 25)} disabled={receiveCash + 25 > 5000}>+25</button>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setReceiveCash(prev => prev + 50)} disabled={receiveCash + 50 > 5000}>+50</button>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setReceiveCash(prev => prev + 100)} disabled={receiveCash + 100 > 5000}>+100</button>
              </div>
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

        {variant === 'advanced' ? (
          <div className="ui-labelframe" style={{ marginTop: 12 }}>
            <div className="ui-title ui-h3">🏠 Rental Agreements</div>
            <div style={{ fontSize: 12, margin: '6px 0' }}>Add property rental agreements where one player receives a percentage of rent income for a set duration.</div>
            <RentalAgreementsEditor
              agreements={rentalAgreements}
              setAgreements={setRentalAgreements}
              myName={myName}
              counterparty={counterparty}
              tiles={tiles}
              mineOwned={mineOwned}
              theirOwned={theirOwned}
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
            {incomingOffer.terms?.rentals?.length ? (
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                Rental agreements:
                <ul>
                  {incomingOffer.terms.rentals.map((r: any, i: number) => (
                    <li key={i}>
                      {r.direction === 'give' ? `${incomingOffer.from} rents ${r.properties.length} properties to ${incomingOffer.to}` 
                                                : `${incomingOffer.to} rents ${r.properties.length} properties to ${incomingOffer.from}`} 
                      - {r.percentage}% rent for {r.turns} turns
                    </li>
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

        {/* Live Pending Trades (all) */}
        <div className="ui-labelframe" style={{ marginTop: 20 }}>
          <div className="ui-title ui-h3">🛰️ Live Pending Trades</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
            {(snapshot.pending_trades || []).length === 0 && <div className="ui-sm" style={{ opacity: 0.7 }}>None</div>}
            {(snapshot.pending_trades || []).map((tr: any) => {
              const mineFrom = tr.from === myName;
              const mineTo = tr.to === myName;
              return (
                <div key={tr.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 6, background: mineTo ? 'rgba(46, 204, 113,0.10)' : (mineFrom ? 'rgba(52,152,219,0.10)' : 'rgba(0,0,0,0.04)') }}>
                  <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span><strong>{tr.from}</strong> → <strong>{tr.to}</strong> #{tr.id}</span>
                    <span style={{ opacity: 0.75 }}>Cash: {tr.give?.cash || 0}↔{tr.receive?.cash || 0}</span>
                  </div>
                  {(tr.terms?.payments?.length || 0) > 0 ? (
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      Payments: {tr.terms.payments.map((p: any) => `${p.from}→${p.to} $${p.amount}x${p.turns}`).join('; ')}
                    </div>
                  ) : null}
                  {(tr.terms?.rentals?.length || 0) > 0 ? (
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      Rentals: {tr.terms.rentals.map((r: any) => `${r.properties.length}props ${r.percentage}%x${r.turns}t`).join('; ')}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {mineTo && <button className="btn btn-success" style={{ padding: '2px 8px' }} onClick={() => s.emit('game_action', { id: lobbyId, action: { type: 'accept_trade', trade_id: tr.id } })}>Accept</button>}
                    {mineTo && <button className="btn btn-danger" style={{ padding: '2px 8px' }} onClick={() => s.emit('game_action', { id: lobbyId, action: { type: 'decline_trade', trade_id: tr.id } })}>Decline</button>}
                    {mineFrom && <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => s.emit('game_action', { id: lobbyId, action: { type: 'cancel_trade', trade_id: tr.id } })}>Cancel</button>}
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

function RentalAgreementsEditor({ agreements, setAgreements, myName, counterparty, tiles, mineOwned, theirOwned }: {
  agreements: Array<{ properties: number[], percentage: number, turns: number, direction: 'give' | 'receive' }>;
  setAgreements: (r: Array<{ properties: number[], percentage: number, turns: number, direction: 'give' | 'receive' }>) => void;
  myName: string;
  counterparty: string;
  tiles: any[];
  mineOwned: Set<number>;
  theirOwned: Set<number>;
}) {
  const add = () => setAgreements([...agreements, { properties: [], percentage: 25, turns: 5, direction: 'give' }]);
  const update = (i: number, patch: Partial<{ properties: number[], percentage: number, turns: number, direction: 'give' | 'receive' }>) => {
    const next = agreements.slice();
    next[i] = { ...next[i], ...patch } as any;
    setAgreements(next);
  };
  const remove = (i: number) => setAgreements(agreements.filter((_, idx) => idx !== i));
  
  const toggleProperty = (agreementIndex: number, propertyPos: number) => {
    const agreement = agreements[agreementIndex];
    const newProperties = agreement.properties.includes(propertyPos)
      ? agreement.properties.filter(p => p !== propertyPos)
      : [...agreement.properties, propertyPos];
    update(agreementIndex, { properties: newProperties });
  };

  return (
    <div>
      {agreements.length === 0 ? <div className="ui-sm" style={{ opacity: 0.75 }}>No rental agreements added.</div> : null}
      {agreements.map((agreement, i) => {
        const availableProperties = agreement.direction === 'give' ? mineOwned : theirOwned;
        const ownerName = agreement.direction === 'give' ? myName : counterparty;
        const renterName = agreement.direction === 'give' ? counterparty : myName;
        
        return (
          <div key={i} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 12, marginBottom: 8, background: '#fafafa' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <select value={agreement.direction} onChange={(e) => update(i, { direction: (e.target.value as any), properties: [] })}>
                <option value="give">I rent out my properties to {counterparty}</option>
                <option value="receive">I get rental rights to {counterparty}'s properties</option>
              </select>
              <button className="btn btn-ghost" onClick={() => remove(i)}>🗑️</button>
            </div>
            
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>
                Properties owned by {ownerName}:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Array.from(availableProperties).map(pos => {
                  const tile = tiles.find(t => t.position === pos) || tiles[pos];
                  const isSelected = agreement.properties.includes(pos);
                  return (
                    <label key={pos} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 4, 
                      fontSize: 11,
                      padding: '2px 6px',
                      border: '1px solid #ccc',
                      borderRadius: 4,
                      background: isSelected ? '#e8f5e8' : '#fff',
                      cursor: 'pointer'
                    }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleProperty(i, pos)}
                        style={{ margin: 0 }}
                      />
                      {tile?.name || `Property ${pos}`}
                    </label>
                  );
                })}
                {availableProperties.size === 0 && (
                  <div style={{ fontSize: 11, opacity: 0.7 }}>No properties owned by {ownerName}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12 }}>
                {renterName} gets
                <input 
                  type="number" 
                  min={1} 
                  max={100} 
                  value={agreement.percentage} 
                  onChange={(e) => update(i, { percentage: parseInt(e.target.value || '0', 10) })} 
                  style={{ width: 60, marginLeft: 4, marginRight: 4 }} 
                />
                % of rent
              </label>
              <label style={{ fontSize: 12 }}>for
                <input 
                  type="number" 
                  min={1} 
                  value={agreement.turns} 
                  onChange={(e) => update(i, { turns: parseInt(e.target.value || '0', 10) })} 
                  style={{ width: 60, marginLeft: 4, marginRight: 4 }} 
                />
                turns
              </label>
            </div>
            
            {agreement.properties.length > 0 && (
              <div style={{ fontSize: 11, marginTop: 6, padding: 6, background: '#e8f5e8', borderRadius: 4 }}>
                <strong>Agreement:</strong> {renterName} will receive {agreement.percentage}% of rent from {agreement.properties.length} properties for {agreement.turns} turns
              </div>
            )}
          </div>
        );
      })}
      <button className="btn" onClick={add}>➕ Add rental agreement</button>
    </div>
  );
}
