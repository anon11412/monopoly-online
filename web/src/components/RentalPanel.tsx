import { useState, useMemo } from 'react';
import { getSocket } from '../lib/socket';
import type { GameSnapshot, BoardTile } from '../types';

type Props = {
  lobbyId: string;
  snapshot: GameSnapshot;
  myName: string;
  onClose: () => void;
  tiles: Record<number, BoardTile>;
};

export default function RentalPanel({ lobbyId, snapshot, myName, onClose, tiles }: Props) {
  const s = getSocket();
  const [selectedPartner, setSelectedPartner] = useState<string>('');
  const [cashAmount, setCashAmount] = useState<number>(500);
  const [percentage, setPercentage] = useState<number>(50);
  const [turns, setTurns] = useState<number>(5);
  const [selectedProperties, setSelectedProperties] = useState<number[]>([]);

  // Get my properties that I can rent out
  const myProperties = useMemo(() => {
    const props: Array<{ pos: number; tile: BoardTile }> = [];
    Object.entries(snapshot.properties || {}).forEach(([posStr, propState]) => {
      const pos = parseInt(posStr);
      if (propState.owner === myName && !propState.mortgaged) {
        const tile = tiles[pos];
        if (tile && tile.type === 'property') {
          props.push({ pos, tile });
        }
      }
    });
    return props.sort((a, b) => a.pos - b.pos);
  }, [snapshot.properties, myName, tiles]);

  // Get other players as potential partners
  const otherPlayers = (snapshot.players || []).filter(p => p.name !== myName);

  const handlePropertyToggle = (pos: number) => {
    setSelectedProperties(prev => 
      prev.includes(pos) 
        ? prev.filter(p => p !== pos)
        : [...prev, pos]
    );
  };

  const handleOfferRental = () => {
    if (!selectedPartner || selectedProperties.length === 0 || cashAmount <= 0 || percentage <= 0 || percentage > 100 || turns <= 0) {
      alert('Please fill all fields correctly');
      return;
    }

    const partnerPlayer = otherPlayers.find(p => p.name === selectedPartner);
    if (!partnerPlayer || partnerPlayer.cash < cashAmount) {
      alert('Selected player does not have enough cash');
      return;
    }

    s.emit('game_action', {
      lobby_id: lobbyId,
      action: {
        type: 'offer_rental',
        to: selectedPartner,
        cash_amount: cashAmount,
        properties: selectedProperties,
        percentage: percentage,
        turns: turns
      }
    });

    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto',
        width: '90%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>🏠 Create Property Rental</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Partner Selection */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Rent to Player:
            </label>
            <select 
              value={selectedPartner} 
              onChange={(e) => setSelectedPartner(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              <option value="">Select a player...</option>
              {otherPlayers.map(p => {
                const debts = (snapshot as any)?.debts?.[p.name] || [];
                const totalDebt = debts.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
                const debtText = totalDebt > 0 ? ` (owes $${totalDebt})` : '';
                return (
                  <option key={p.name} value={p.name}>
                    {p.name} (${p.cash}){debtText}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Property Selection */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Properties to Rent ({selectedProperties.length} selected):
            </label>
            <div style={{ 
              maxHeight: '200px', 
              overflow: 'auto', 
              border: '1px solid #ccc', 
              borderRadius: '4px',
              padding: '8px'
            }}>
              {myProperties.length === 0 ? (
                <div style={{ opacity: 0.7 }}>You don't own any properties to rent</div>
              ) : (
                myProperties.map(({ pos, tile }) => (
                  <div key={pos} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginBottom: '4px',
                    padding: '4px',
                    backgroundColor: selectedProperties.includes(pos) ? '#e8f5e8' : 'transparent',
                    borderRadius: '4px'
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedProperties.includes(pos)}
                      onChange={() => handlePropertyToggle(pos)}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ color: tile.color || undefined }}>
                      {tile.name}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Terms */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Cash Payment: $
              </label>
              <input
                type="number"
                min="1"
                max="5000"
                value={cashAmount}
                onChange={(e) => setCashAmount(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Rent Percentage: %
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={percentage}
                onChange={(e) => setPercentage(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Duration (turns):
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={turns}
              onChange={(e) => setTurns(parseInt(e.target.value) || 0)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>

          {/* Preview */}
          {selectedPartner && selectedProperties.length > 0 && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#f0f8ff', 
              borderRadius: '4px',
              border: '1px solid #add8e6'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Deal Preview:</div>
              <div>• {selectedPartner} pays you ${cashAmount} immediately</div>
              <div>• You give {selectedPartner} {percentage}% of rent from {selectedProperties.length} properties</div>
              <div>• Agreement lasts for {turns} turns</div>
              <div>• After {turns} turns, full rent rights return to you</div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button 
              onClick={onClose}
              style={{ 
                padding: '10px 20px', 
                border: '1px solid #ccc', 
                borderRadius: '4px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button 
              onClick={handleOfferRental}
              disabled={!selectedPartner || selectedProperties.length === 0 || cashAmount <= 0 || percentage <= 0 || percentage > 100 || turns <= 0}
              style={{ 
                padding: '10px 20px', 
                border: 'none', 
                borderRadius: '4px',
                background: '#007bff',
                color: 'white',
                cursor: selectedPartner && selectedProperties.length > 0 ? 'pointer' : 'not-allowed',
                opacity: selectedPartner && selectedProperties.length > 0 ? 1 : 0.5
              }}
            >
              Offer Rental
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
