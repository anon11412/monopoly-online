// Audio system for Monopoly Online
// Provides sound effects for game actions with global/personal audio rules

interface AudioConfig {
  enabled: boolean;
  volume: number;
  soundPack: string;
}

interface SoundDefinition {
  url: string;
  frequency?: number;
  duration?: number;
  volume?: number;
}

class AudioManager {
  private config: AudioConfig;
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private soundPacks: Map<string, Record<string, SoundDefinition>> = new Map();

  constructor() {
  const storedPack = localStorage.getItem('audio.soundPack');
    this.config = {
      enabled: localStorage.getItem('audio.enabled') !== '0',
      volume: parseFloat(localStorage.getItem('audio.volume') || '0.7'),
      soundPack: storedPack ? storedPack : 'retro'
    };
    this.initializeSoundPacks();
  }

  private initializeSoundPacks(): void {
    // Classic sound pack (simple beeps)
    this.soundPacks.set('classic', {
      'dice_roll': { url: '', frequency: 800, duration: 0.2, volume: 0.8 },
      'your_turn': { url: '', frequency: 1000, duration: 0.5, volume: 0.9 },
      'property_bought': { url: '', frequency: 600, duration: 0.4, volume: 0.7 },
      'money_gained': { url: '', frequency: 1200, duration: 0.3, volume: 0.8 },
      'money_lost': { url: '', frequency: 400, duration: 0.4, volume: 0.8 },
  // Trade sounds tuned for prominence hierarchy: accepted > created > denied
  'trade_created': { url: '', frequency: 920, duration: 0.32, volume: 0.85 },
  'trade_accepted': { url: '', frequency: 1450, duration: 0.46, volume: 0.95 },
  'trade_denied': { url: '', frequency: 340, duration: 0.55, volume: 0.75 },
      'trade_sent': { url: '', frequency: 950, duration: 0.2, volume: 0.6 },
      'trade_declined': { url: '', frequency: 300, duration: 0.5, volume: 0.7 },
      'chat_message': { url: '', frequency: 800, duration: 0.15, volume: 0.5 },
      'chance_landed': { url: '', frequency: 850, duration: 0.3, volume: 0.7 },
      'treasure_landed': { url: '', frequency: 1400, duration: 0.4, volume: 0.8 },
      'sent_to_jail': { url: '', frequency: 250, duration: 0.6, volume: 0.9 },
      'pass_go': { url: '', frequency: 1500, duration: 0.6, volume: 0.9 },
      'mortgage': { url: '', frequency: 480, duration: 0.5, volume: 0.9 },
      'unmortgage': { url: '', frequency: 720, duration: 0.4, volume: 0.9 },
      'button_click': { url: '', frequency: 900, duration: 0.1, volume: 0.4 },
      'notification': { url: '', frequency: 1100, duration: 0.2, volume: 0.6 }
    });

    // Retro sound pack (8-bit style)
    this.soundPacks.set('retro', {
      'dice_roll': { url: '', frequency: 440, duration: 0.15, volume: 0.8 },
      'your_turn': { url: '', frequency: 660, duration: 0.4, volume: 0.9 },
      'property_bought': { url: '', frequency: 523, duration: 0.3, volume: 0.7 },
      'money_gained': { url: '', frequency: 880, duration: 0.25, volume: 0.8 },
      'money_lost': { url: '', frequency: 220, duration: 0.35, volume: 0.8 },
  'trade_created': { url: '', frequency: 660, duration: 0.27, volume: 0.86 },
  'trade_accepted': { url: '', frequency: 1180, duration: 0.34, volume: 0.96 },
  'trade_denied': { url: '', frequency: 240, duration: 0.42, volume: 0.75 },
      'trade_sent': { url: '', frequency: 700, duration: 0.15, volume: 0.6 },
      'trade_declined': { url: '', frequency: 200, duration: 0.4, volume: 0.7 },
      'chat_message': { url: '', frequency: 550, duration: 0.12, volume: 0.5 },
      'chance_landed': { url: '', frequency: 740, duration: 0.25, volume: 0.7 },
      'treasure_landed': { url: '', frequency: 1320, duration: 0.35, volume: 0.8 },
      'sent_to_jail': { url: '', frequency: 165, duration: 0.5, volume: 0.9 },
      'pass_go': { url: '', frequency: 1760, duration: 0.5, volume: 0.9 },
      'mortgage': { url: '', frequency: 330, duration: 0.4, volume: 0.9 },
      'unmortgage': { url: '', frequency: 550, duration: 0.35, volume: 0.9 },
      'button_click': { url: '', frequency: 600, duration: 0.08, volume: 0.4 },
      'notification': { url: '', frequency: 800, duration: 0.15, volume: 0.6 }
    });

    // Modern sound pack (smooth tones)
    this.soundPacks.set('modern', {
      'dice_roll': { url: '', frequency: 750, duration: 0.25, volume: 0.8 },
      'your_turn': { url: '', frequency: 1200, duration: 0.6, volume: 0.9 },
      'property_bought': { url: '', frequency: 650, duration: 0.45, volume: 0.7 },
      'money_gained': { url: '', frequency: 1350, duration: 0.35, volume: 0.8 },
      'money_lost': { url: '', frequency: 350, duration: 0.45, volume: 0.8 },
  'trade_created': { url: '', frequency: 1010, duration: 0.36, volume: 0.85 },
  'trade_accepted': { url: '', frequency: 1520, duration: 0.5, volume: 0.97 },
  'trade_denied': { url: '', frequency: 315, duration: 0.58, volume: 0.75 },
      'trade_sent': { url: '', frequency: 1050, duration: 0.25, volume: 0.6 },
      'trade_declined': { url: '', frequency: 280, duration: 0.55, volume: 0.7 },
      'chat_message': { url: '', frequency: 900, duration: 0.18, volume: 0.5 },
      'chance_landed': { url: '', frequency: 900, duration: 0.35, volume: 0.7 },
      'treasure_landed': { url: '', frequency: 1500, duration: 0.45, volume: 0.8 },
      'sent_to_jail': { url: '', frequency: 200, duration: 0.7, volume: 0.9 },
      'pass_go': { url: '', frequency: 1600, duration: 0.7, volume: 0.9 },
      'mortgage': { url: '', frequency: 420, duration: 0.55, volume: 0.9 },
      'unmortgage': { url: '', frequency: 780, duration: 0.45, volume: 0.9 },
      'button_click': { url: '', frequency: 1000, duration: 0.12, volume: 0.4 },
      'notification': { url: '', frequency: 1250, duration: 0.25, volume: 0.6 }
    });
  }

  async loadSound(key: string, url?: string): Promise<void> {
    if (this.sounds.has(key)) return;
    
    const soundPack = this.soundPacks.get(this.config.soundPack) || this.soundPacks.get('classic')!;
    const soundDef = soundPack[key];
    
    if (!soundDef) {
      console.warn(`Audio: Sound "${key}" not defined in sound pack "${this.config.soundPack}"`);
      return;
    }

    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = this.config.volume * (soundDef.volume || 1);
    
    // Use provided URL or generate from sound definition
    if (url || soundDef.url) {
      audio.src = url || soundDef.url;
    } else if (soundDef.frequency) {
      audio.src = this.createToneDataUri(soundDef.frequency, soundDef.duration || 0.3);
    }
    
    return new Promise((resolve, reject) => {
      audio.addEventListener('canplaythrough', () => {
        this.sounds.set(key, audio);
        resolve();
      });
      audio.addEventListener('error', reject);
    });
  }

  play(key: string, options: { volume?: number; personal?: boolean } = {}): void {
    if (!this.config.enabled) return;
    
    const audio = this.sounds.get(key);
    if (!audio) {
      console.warn(`Audio: Sound "${key}" not loaded`);
      return;
    }

    // Clone audio for overlapping sounds
    const cloned = audio.cloneNode() as HTMLAudioElement;
    cloned.volume = (options.volume ?? 1) * this.config.volume;
    
    cloned.play().catch(err => {
      console.warn(`Audio: Failed to play "${key}":`, err);
    });
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    localStorage.setItem('audio.enabled', enabled ? '1' : '0');
  }

  setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem('audio.volume', this.config.volume.toString());
    
    // Update volume for all loaded sounds
    this.sounds.forEach((audio, key) => {
      const soundPack = this.soundPacks.get(this.config.soundPack) || this.soundPacks.get('classic')!;
      const soundDef = soundPack[key];
      audio.volume = this.config.volume * (soundDef?.volume || 1);
    });
  }

  setSoundPack(packName: string): void {
    if (!this.soundPacks.has(packName)) {
      console.warn(`Audio: Sound pack "${packName}" not found`);
      return;
    }
    
    this.config.soundPack = packName;
    localStorage.setItem('audio.soundPack', packName);
    
    // Clear loaded sounds to force reload with new pack
    this.sounds.clear();
  }

  getSoundPacks(): string[] {
    return Array.from(this.soundPacks.keys());
  }

  getCurrentSoundPack(): string {
    return this.config.soundPack;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getVolume(): number {
    return this.config.volume;
  }

  // Generate enhanced tone with attack/decay envelope
  private createToneDataUri(frequency: number, duration: number): string {
    const sampleRate = 44100;
    const samples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);
    
    // Generate enhanced sine wave with envelope
    const attackTime = Math.min(0.05, duration * 0.2);
    const decayTime = Math.min(0.1, duration * 0.3);
    const sustainLevel = 0.7;
    const releaseTime = Math.min(0.1, duration * 0.3);
    
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      let amplitude = 0.3;
      
      // ADSR envelope
      if (t < attackTime) {
        amplitude *= t / attackTime;
      } else if (t < attackTime + decayTime) {
        const decayProgress = (t - attackTime) / decayTime;
        amplitude *= 1 - (1 - sustainLevel) * decayProgress;
      } else if (t < duration - releaseTime) {
        amplitude *= sustainLevel;
      } else {
        const releaseProgress = (t - (duration - releaseTime)) / releaseTime;
        amplitude *= sustainLevel * (1 - releaseProgress);
      }
      
      const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
      view.setInt16(44 + i * 2, sample * 32767, true);
    }
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }
}

// Global audio manager instance
export const audioManager = new AudioManager();

// Initialize audio system
export async function initializeAudio(): Promise<void> {
  try {
    // Load all sounds from current sound pack
    const soundPack = audioManager.getSoundPacks().includes(audioManager.getCurrentSoundPack())
      ? audioManager.getCurrentSoundPack()
      : 'classic';
    
    const sounds = [
      'dice_roll', 'your_turn', 'property_bought', 'money_gained', 'money_lost',
      'trade_sent', 'trade_declined', 'chance_landed', 'treasure_landed',
      'sent_to_jail', 'pass_go', 'button_click', 'notification',
      // extra commonly used keys
      'trade_created', 'trade_accepted', 'trade_denied', 'chat_message'
    ];
    
    for (const soundKey of sounds) {
      await audioManager.loadSound(soundKey);
    }
    
    console.log(`Audio: Initialized with "${soundPack}" sound pack (${sounds.length} sounds loaded)`);
  } catch (error) {
    console.warn('Audio: Failed to initialize:', error);
  }
}

// Game event handlers with enhanced variety
export function playGameSound(event: string, context: any = {}): void {
  const { currentPlayer, myName, amount } = context;
  
  switch (event) {
    case 'dice_rolled':
      audioManager.play('dice_roll');
      break;
      
    case 'turn_started':
      if (currentPlayer === myName) {
        audioManager.play('your_turn');
      }
      break;
      
    case 'property_purchased':
      audioManager.play('property_bought');
      break;
      
    case 'money_changed':
      if (amount > 0) {
        audioManager.play('money_gained', { volume: Math.min(1, Math.abs(amount) / 1000) });
      } else if (amount < 0) {
        audioManager.play('money_lost', { volume: Math.min(1, Math.abs(amount) / 1000) });
      }
      break;
      
    case 'passed_go':
    case 'landed_go':
      audioManager.play('pass_go');
      break;
      
    case 'landed_chance':
      audioManager.play('chance_landed');
      break;
      
    case 'landed_treasure':
      audioManager.play('treasure_landed');
      break;
      
    case 'sent_to_jail':
      audioManager.play('sent_to_jail');
      break;
      
    case 'trade_offered':
      audioManager.play('trade_sent');
      break;
      
    case 'trade_rejected':
      audioManager.play('trade_declined');
      break;
      
    case 'button_click':
      audioManager.play('button_click');
      break;
      
    case 'notification':
      audioManager.play('notification');
      break;
      
    default:
      // Try to play the event directly if it matches a sound key
      try {
        audioManager.play(event);
      } catch {
        // Ignore unknown sound events
      }
  }
}

// UI helper functions
export function createAudioControls(): {
  enabled: boolean;
  volume: number;
  soundPack: string;
  soundPacks: string[];
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setSoundPack: (pack: string) => void;
  testSound: (soundKey: string) => void;
} {
  return {
    enabled: audioManager.isEnabled(),
    volume: audioManager.getVolume(),
    soundPack: audioManager.getCurrentSoundPack(),
    soundPacks: audioManager.getSoundPacks(),
    setEnabled: (enabled: boolean) => {
      audioManager.setEnabled(enabled);
      if (enabled) {
        audioManager.play('notification');
      }
    },
    setVolume: (volume: number) => {
      audioManager.setVolume(volume);
      audioManager.play('button_click');
    },
    setSoundPack: async (pack: string) => {
      audioManager.setSoundPack(pack);
      // Reinitialize with new pack
      await initializeAudio();
      audioManager.play('notification');
    },
    testSound: (soundKey: string) => {
      audioManager.play(soundKey);
    }
  };
}

export default audioManager;
