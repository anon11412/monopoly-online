import { useState } from 'react';
import { useAccessibility, announceToScreenReader } from '../lib/accessibility';

interface AccessibilitySettingsProps {
  onClose?: () => void;
  compact?: boolean;
}

export function AccessibilitySettings({ onClose, compact = false }: AccessibilitySettingsProps) {
  const { settings, updateSetting } = useAccessibility();
  const [showFullSettings, setShowFullSettings] = useState(!compact);

  const handleSettingChange = (key: string, value: any) => {
    updateSetting(key as any, value);
    announceToScreenReader(`${key} ${value ? 'enabled' : 'disabled'}`);
  };

  if (compact) {
    return (
      <div className="accessibility-settings-compact" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: 'var(--bg-secondary)',
        borderRadius: 6,
        border: '1px solid var(--border-color)'
      }}>
        <span style={{ fontSize: 14, fontWeight: '500' }}>♿ A11y:</span>
        
        <button
          className="btn btn-ghost"
          onClick={() => setShowFullSettings(!showFullSettings)}
          style={{ padding: '4px 8px', fontSize: 12 }}
          aria-expanded={showFullSettings}
          aria-label="Toggle accessibility settings"
        >
          {showFullSettings ? '▼' : '▶'} Settings
        </button>

        {showFullSettings && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(e) => handleSettingChange('reducedMotion', e.target.checked)}
                aria-label="Reduce motion and animations"
              />
              Motion
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) => handleSettingChange('highContrast', e.target.checked)}
                aria-label="Enable high contrast mode"
              />
              Contrast
            </label>
            
            <select
              value={settings.fontSize}
              onChange={(e) => handleSettingChange('fontSize', e.target.value)}
              style={{
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: 11
              }}
              aria-label="Text size"
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="accessibility-settings" style={{
      background: 'var(--bg-primary)',
      border: '2px solid var(--border-color)',
      borderRadius: 12,
      padding: 20,
      maxWidth: 500,
      margin: '0 auto'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          ♿ Accessibility Settings
        </h3>
        {onClose && (
          <button 
            className="btn btn-ghost" 
            onClick={onClose}
            style={{ padding: '4px 8px', fontSize: 12 }}
            aria-label="Close accessibility settings"
          >
            ✕
          </button>
        )}
      </div>

      {/* Motion Settings */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(e) => handleSettingChange('reducedMotion', e.target.checked)}
            aria-describedby="motion-help"
          />
          <span style={{ fontSize: 16, fontWeight: '500' }}>Reduce Motion</span>
        </label>
        <div id="motion-help" style={{ fontSize: 12, opacity: 0.7, marginTop: 4, marginLeft: 28 }}>
          Disables animations and transitions that may cause motion sensitivity issues
        </div>
      </div>

      {/* Contrast Settings */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.highContrast}
            onChange={(e) => handleSettingChange('highContrast', e.target.checked)}
            aria-describedby="contrast-help"
          />
          <span style={{ fontSize: 16, fontWeight: '500' }}>High Contrast</span>
        </label>
        <div id="contrast-help" style={{ fontSize: 12, opacity: 0.7, marginTop: 4, marginLeft: 28 }}>
          Increases contrast for better visibility
        </div>
      </div>

      {/* Font Size */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: '500' }}>
          Text Size:
        </label>
        <select
          value={settings.fontSize}
          onChange={(e) => handleSettingChange('fontSize', e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: 14
          }}
          aria-describedby="font-size-help"
        >
          <option value="small">Small</option>
          <option value="medium">Medium (Default)</option>
          <option value="large">Large</option>
        </select>
        <div id="font-size-help" style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
          Adjusts the size of text throughout the application
        </div>
      </div>

      {/* Keyboard Navigation */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.keyboardNavigation}
            onChange={(e) => handleSettingChange('keyboardNavigation', e.target.checked)}
            aria-describedby="keyboard-help"
          />
          <span style={{ fontSize: 16, fontWeight: '500' }}>Enhanced Keyboard Navigation</span>
        </label>
        <div id="keyboard-help" style={{ fontSize: 12, opacity: 0.7, marginTop: 4, marginLeft: 28 }}>
          Enables additional keyboard shortcuts and improved focus management
        </div>
      </div>

      {/* Screen Reader */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.screenReaderAnnouncements}
            onChange={(e) => handleSettingChange('screenReaderAnnouncements', e.target.checked)}
            aria-describedby="sr-help"
          />
          <span style={{ fontSize: 16, fontWeight: '500' }}>Screen Reader Announcements</span>
        </label>
        <div id="sr-help" style={{ fontSize: 12, opacity: 0.7, marginTop: 4, marginLeft: 28 }}>
          Provides audio descriptions of game events and state changes
        </div>
      </div>

      {/* Keyboard Shortcuts Reference */}
      <div style={{ 
        background: 'var(--bg-secondary)', 
        padding: 12, 
        borderRadius: 6, 
        fontSize: 13,
        opacity: 0.8
      }}>
        <strong>🎮 Keyboard Shortcuts:</strong>
        <ul style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
          <li><kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> - Navigate between controls</li>
          <li><kbd>Enter</kbd> / <kbd>Space</kbd> - Activate focused element</li>
          <li><kbd>Arrow Keys</kbd> - Navigate within panels</li>
          <li><kbd>Escape</kbd> - Close modals and dialogs</li>
          <li><kbd>Alt+M</kbd> - Open main menu</li>
          <li><kbd>Alt+A</kbd> - Open action panel</li>
        </ul>
      </div>
    </div>
  );
}

export default AccessibilitySettings;
