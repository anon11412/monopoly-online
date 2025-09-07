import { useEffect, useMemo, useState } from 'react';
import { BACKEND_URL, BOARD_META_PATH } from '../config';
import { buildDefaultBoardTiles } from '../lib/boardFallback';
import type { BoardTile, GameSnapshot, PropertyState, PropertyStateLike } from '../types';
import { buildPlayerColorMap } from '../lib/colors';
import { getSocket } from '../lib/socket';
import { getStreetRent, houseCostForGroup, mortgageValue, RAILROAD_RENTS } from '../lib/rentData';

type Props = { snapshot: GameSnapshot | null; lobbyId?: string };

export default function GameBoard({ snapshot, lobbyId }: Props) {
  const [tiles, setTiles] = useState<BoardTile[]>([]);
  const [err, setErr] = useState<string>('');
  const [openPropPos, setOpenPropPos] = useState<number | null>(null);
  const s = getSocket();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setErr('');
  const bases = [BACKEND_URL || '', 'http://127.0.0.1:8001', 'http://127.0.0.1:8000'];
      for (const base of bases) {
        try {
      const url = base ? `${base}${BOARD_META_PATH}` : BOARD_META_PATH;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) continue;
          const data = await res.json();
          const arr = Array.isArray(data) ? data : (Array.isArray(data?.tiles) ? data.tiles : null);
          if (arr && !cancelled) {
            setTiles(arr as BoardTile[]);
            return;
          }
        } catch (_) {
          // try next base
        }
      }
      if (!cancelled) {
        setErr('Board metadata unavailable (using fallback)');
        setTiles(buildDefaultBoardTiles());
      }
    }
    load();
    return () => { cancelled = true };
  }, []);

  // tiles are rendered directly; map by position if needed later
  const tileByPos = useMemo(() => Object.fromEntries(tiles.map(t => [t.pos, t])), [tiles]);

  const curIdx = snapshot?.current_turn ?? -1;
  const curName = curIdx >= 0 ? snapshot?.players?.[curIdx]?.name : undefined;
  const playerColors = buildPlayerColorMap(snapshot?.players ?? []);
  const normalize = (pos: number, raw: PropertyStateLike | undefined): PropertyState | undefined => {
    if (!raw) return undefined;
    const houses: number = typeof raw.houses === 'number' ? raw.houses : (raw.houseCount ?? 0);
    const hotel: boolean = typeof raw.hotel === 'boolean' ? raw.hotel : (houses === 5);
    const mortgaged: boolean = !!(raw.mortgaged ?? raw.is_mortgaged);
    const owner = (raw.owner ?? raw.owner_name ?? raw.ownerId ?? raw.owner_id) as string | undefined;
    const owner_color = (raw.owner_color ?? raw.ownerColour ?? raw.owner_colour ?? raw.ownerColor) as string | undefined
      || (owner ? playerColors[owner] : undefined);
    return { pos, owner, owner_color, houses: Math.min(houses, 4), hotel: !!hotel && houses >= 5 ? true : !!hotel, mortgaged };
  };
  const props = snapshot?.properties || {};

  return (
    <div className="board">
      {err ? <div style={{ color: '#e74c3c', fontSize: 12, marginBottom: 6 }}>{err}</div> : null}
      <div style={{ padding: '4px 6px', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Turn: {curName || '—'}</div>
      <div className="board-wrap">
        <div className="grid">
        {tiles.length === 0 ? (
          <div style={{ gridColumn: 6, gridRow: 6, alignSelf: 'center', justifySelf: 'center', fontSize: 12, opacity: 0.8 }}>No board to display</div>
        ) : tiles.map((t) => {
          const p = normalize(t.pos, props[t.pos as any]);
          const ownerColor = p?.owner_color;
          const houses = p?.houses || 0;
          const hotel = p?.hotel || false;
          const mortgaged = !!p?.mortgaged;
          const isCurrent = snapshot?.players?.[curIdx]?.position === t.pos;
          const clickable = (t.type === 'property' || t.type === 'railroad' || t.type === 'utility');
          const edge = (() => {
            // Determine board edge to place owner marker toward center
            if (t.y === 10) return 'top'; // bottom row on grid -> owner above
            if (t.y === 0) return 'bottom'; // top row -> owner below
            if (t.x === 0) return 'right'; // left col -> owner to right
            if (t.x === 10) return 'left'; // right col -> owner to left
            return 'top';
          })();
          return (
            <div key={t.pos} className={`tile type-${t.type || 'prop'}`} style={{ gridColumn: t.x + 1, gridRow: t.y + 1, outline: isCurrent ? '2px solid #f1c40f' : undefined, cursor: clickable ? 'pointer' : undefined }} onClick={() => clickable ? setOpenPropPos(t.pos) : undefined}>
              <div className="stripe" style={{ background: t.color || 'transparent' }} />
              <div className="name">{t.name}</div>
              {ownerColor ? <div className={`owner ${edge}`} style={{ background: ownerColor }} /> : null}
              {(houses > 0 && houses < 5) ? (
                <div className="houses">{Array.from({ length: houses }).map((_, i) => <div key={i} className="house" />)}</div>
              ) : null}
              {hotel ? <div className="houses"><div className="hotel" /></div> : null}
              {mortgaged ? <div className="mortgage">M</div> : null}
              {(() => {
                const here = (snapshot?.players || []).filter(pl => pl.position === t.pos);
                if (here.length === 0) return null;
                // Arrange up to 4 tokens in a centered 2x2 grid; 1 token stays centered
                const gridTemplate = here.length <= 1 ? '1fr' : '1fr 1fr';
                return (
                  <div className="tokens" style={{ display: 'grid', gridTemplateColumns: gridTemplate, gridTemplateRows: gridTemplate, alignItems: 'center', justifyItems: 'center', gap: 4 }}>
                    {here.map((pl, idx) => (
                      <span key={idx} className="token" title={pl.name} style={{ background: pl.color || '#111' }} />
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })}
        </div>
      </div>
      {openPropPos != null ? (() => {
        const t = tileByPos[openPropPos!];
  const p = normalize(openPropPos!, props[openPropPos as any]);
        const owner = p?.owner;
  const price = (t as any)?.price ?? 0;
  // Buy button moved to central action bar; evaluate there
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setOpenPropPos(null)}>
            <div style={{ background: '#fff', minWidth: 320, maxWidth: '85vw', borderRadius: 8, padding: 12 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{t?.name || `Tile ${openPropPos}`}</h3>
                <button className="btn btn-ghost" onClick={() => setOpenPropPos(null)}>❌ Close</button>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <div style={{ width: 18, height: 18, background: t?.color || 'transparent', border: '1px solid #bbb' }} />
                <div style={{ fontSize: 12, opacity: 0.8 }}>{t?.type}</div>
              </div>
              {price ? <div style={{ marginTop: 8, fontSize: 12 }}>Price: ${price} {t?.group ? <span style={{ opacity: 0.75 }}>(mortgage ${mortgageValue(price)})</span> : null}</div> : null}
              {owner ? <div style={{ marginTop: 4, fontSize: 12 }}>Owner: {owner}</div> : null}
              {(() => {
                if (!t) return null;
                if (t.type === 'property') {
                  const r = getStreetRent(t.name);
                  const hc = houseCostForGroup(t.group);
                  return r ? (
                    <div className="ui-card" style={{ marginTop: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Rent Details</div>
                      <div>Base: ${r.base} {t.group ? <span style={{ opacity: 0.7 }}>(double with full set: ${r.withSet})</span> : null}</div>
                      <div>With 1 House: ${r.house1}</div>
                      <div>With 2 Houses: ${r.house2}</div>
                      <div>With 3 Houses: ${r.house3}</div>
                      <div>With 4 Houses: ${r.house4}</div>
                      <div>With Hotel: ${r.hotel}</div>
                      <div style={{ marginTop: 6 }}>House cost: ${hc} each, Hotel: ${hc} + return 4 houses</div>
                    </div>
                  ) : null;
                } else if (t.type === 'railroad') {
                  return (
                    <div className="ui-card" style={{ marginTop: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Railroad Rent</div>
                      <div>1 RR: ${RAILROAD_RENTS[0]}</div>
                      <div>2 RR: ${RAILROAD_RENTS[1]}</div>
                      <div>3 RR: ${RAILROAD_RENTS[2]}</div>
                      <div>4 RR: ${RAILROAD_RENTS[3]}</div>
                    </div>
                  );
                } else if (t.type === 'utility') {
                  return (
                    <div className="ui-card" style={{ marginTop: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Utility Rent</div>
                      <div>One utility: 4× dice roll</div>
                      <div>Both utilities: 10× dice roll</div>
                    </div>
                  );
                }
                return null;
              })()}
              {(() => {
                const la: any = snapshot?.last_action;
                if (la && typeof la.pos === 'number' && la.pos === openPropPos && /denied|failed/.test(String(la.type || ''))) {
                  const reason = la.reason || la.type;
                  return <div style={{ marginTop: 6, fontSize: 12, color: '#c0392b' }}>Action denied: {reason}</div>;
                }
                return null;
              })()}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {(() => {
                  const meIdx = snapshot?.current_turn ?? -1;
                  const me = meIdx >= 0 ? snapshot?.players?.[meIdx] : undefined;
                  const iOwn = me && p?.owner === me.name;
                  const buyable = t && (t.type === 'property' || t.type === 'railroad' || t.type === 'utility');
                  const isProp = t?.type === 'property';
                  const pos = t?.pos ?? 0;
                  const doEmit = (type: string) => () => s.emit('game_action', { id: lobbyId || (window as any).__lobbyId || '', action: { type, pos } });
                  return (
                    <>
                      <button className="btn btn-ghost" onClick={doEmit('mortgage')} disabled={!iOwn || !buyable || !!p?.mortgaged}>🏦 Mortgage</button>
                      <button className="btn btn-ghost" onClick={doEmit('unmortgage')} disabled={!iOwn || !buyable || !p?.mortgaged}>💳 Unmortgage</button>
                      <button className="btn btn-ghost" onClick={doEmit('buy_house')} disabled={!iOwn || !isProp}>🏠 Buy House</button>
                      <button className="btn btn-ghost" onClick={doEmit('sell_house')} disabled={!iOwn || !isProp}>🏚️ Sell House</button>
                      <button className="btn btn-ghost" onClick={doEmit('buy_hotel')} disabled={!iOwn || !isProp}>🏨 Buy Hotel</button>
                      <button className="btn btn-ghost" onClick={doEmit('sell_hotel')} disabled={!iOwn || !isProp}>🏨 Sell Hotel</button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
