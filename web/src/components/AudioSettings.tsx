import { useState, useEffect } from 'react';
import { createAudioControls } from '../lib/audio';

interface AudioSettingsProps {
  onClose?: () => void;
  compact?: boolean;
}

export function AudioSettings({ onClose, compact = false }: AudioSettingsProps) {
  const [controls, setControls] = useState(createAudioControls());

  // Refresh controls when settings change
  useEffect(() => {
    const interval = setInterval(() => {
      setControls(createAudioControls());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleEnabledChange = (enabled: boolean) => {
    controls.setEnabled(enabled);
    setControls(createAudioControls());
  };

  const handleVolumeChange = (volume: number) => {
    controls.setVolume(volume);
    setControls(createAudioControls());
  };

  const handleSoundPackChange = (pack: string) => {
    controls.setSoundPack(pack);
    setControls(createAudioControls());
  };

  const testSounds = [
    { key: 'dice_roll', label: '🎲 Dice Roll' },
    { key: 'your_turn', label: '🔔 Your Turn' },
    { key: 'property_bought', label: '🏠 Property Bought' },
    { key: 'money_gained', label: '💰 Money Gained' },
    { key: 'money_lost', label: '💸 Money Lost' },
    { key: 'notification', label: '📢 Notification' }
  ];

  if (compact) {
    return (
      <div className="audio-settings-compact" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: 'var(--bg-secondary)',
        borderRadius: 6,
        border: '1px solid var(--border-color)'
      }}>
        <span style={{ fontSize: 14, fontWeight: '500' }}>🔊 Audio:</span>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={controls.enabled}
            onChange={(e) => handleEnabledChange(e.target.checked)}
          />
          <span style={{ fontSize: 13 }}>Enabled</span>
        </label>

        {controls.enabled && (
          <>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={controls.volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              style={{ width: 80 }}
              title={`Volume: ${Math.round(controls.volume * 100)}%`}
            />
            
            <select
              value={controls.soundPack}
              onChange={(e) => handleSoundPackChange(e.target.value)}
              style={{
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: 12
              }}
            >
              {controls.soundPacks.map(pack => (
                <option key={pack} value={pack}>
                  {pack.charAt(0).toUpperCase() + pack.slice(1)}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="audio-settings" style={{
      background: 'var(--bg-primary)',
      border: '2px solid var(--border-color)',
      borderRadius: 12,
      padding: 20,
      maxWidth: 500,
      margin: '0 auto'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          🔊 Audio Settings
        </h3>
        {onClose && (
          <button 
            className="btn btn-ghost" 
            onClick={onClose}
            style={{ padding: '4px 8px', fontSize: 12 }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Enable/Disable */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={controls.enabled}
            onChange={(e) => handleEnabledChange(e.target.checked)}
          />
          <span style={{ fontSize: 16, fontWeight: '500' }}>Enable Sound Effects</span>
        </label>
      </div>

      {controls.enabled && (
        <>
          {/* Volume Control */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: '500' }}>
              Volume: {Math.round(controls.volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={controls.volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Sound Pack Selection */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: '500' }}>
              Sound Pack:
            </label>
            <select
              value={controls.soundPack}
              onChange={(e) => handleSoundPackChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: 14
              }}
            >
              {controls.soundPacks.map(pack => (
                <option key={pack} value={pack}>
                  {pack.charAt(0).toUpperCase() + pack.slice(1)} Pack
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              {controls.soundPack === 'classic' && 'Standard beep tones with clear frequency separation'}
              {controls.soundPack === 'retro' && '8-bit style sounds reminiscent of classic games'}
              {controls.soundPack === 'modern' && 'Smooth synthesized tones with advanced envelopes'}
            </div>
          </div>

          {/* Test Sounds */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: '500' }}>
              Test Sounds:
            </label>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
              gap: 8 
            }}>
              {testSounds.map(sound => (
                <button
                  key={sound.key}
                  className="btn btn-ghost"
                  onClick={() => controls.testSound(sound.key)}
                  style={{ 
                    padding: '6px 10px', 
                    fontSize: 12,
                    textAlign: 'left',
                    justifyContent: 'flex-start'
                  }}
                >
                  {sound.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div style={{ 
            background: 'var(--bg-secondary)', 
            padding: 12, 
            borderRadius: 6, 
            fontSize: 13,
            opacity: 0.8
          }}>
            <strong>💡 Tips:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
              <li>Sounds will play for dice rolls, property purchases, money changes, and notifications</li>
              <li>Different sound packs offer unique audio styles - try them all!</li>
              <li>Volume affects all game sounds - adjust to your preference</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export default AudioSettings;
