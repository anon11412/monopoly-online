import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { CoinStorePage } from './CoinStorePage';
import { ensureApiSession } from '../lib/session';

interface ProfilePageProps {
  onBack: () => void;
}

interface UserStats {
  games_played: number;
  games_won: number;
  win_rate: number;
  total_earnings: number;
  gold_coins: number;
  silver_coins: number;
  coins?: number; // legacy fallback from API
  premium_piece_owned: boolean;
  member_since: string;
}

// Single premium 3D coin piece
const PREMIUM_COIN_PIECE = {
  id: 'premium-coin',
  name: 'Premium 3D Coin',
  price: 50,
  description: 'A beautiful flattened coin piece with 3D depth and golden shimmer',
  preview: '🪙'
};

export const ProfilePage: React.FC<ProfilePageProps> = ({ onBack }) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [userStats, setUserStats] = useState<UserStats>({
    games_played: 0,
    games_won: 0,
    win_rate: 0,
    total_earnings: 0,
    gold_coins: 0,
    silver_coins: 0,
    premium_piece_owned: false,
    member_since: 'Today'
  });
  const [isLoading, setIsLoading] = useState(true);

  const loadUserStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const sessionOk = await ensureApiSession(user?.name);
      if (!sessionOk) {
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/user/stats', { credentials: 'include' });
      if (response.ok) {
        const stats = await response.json();
        setUserStats({
          ...stats,
          gold_coins: stats.gold_coins ?? stats.coins ?? 0,
          silver_coins: stats.silver_coins ?? 0,
          coins: undefined
        });
      } else if (response.status === 401) {
        // Attempt one retry after re-establishing the guest session
        const retryOk = await ensureApiSession(user?.name);
        if (retryOk) {
          const retry = await fetch('/api/user/stats', { credentials: 'include' });
          if (retry.ok) {
            const stats = await retry.json();
            setUserStats({
              ...stats,
              gold_coins: stats.gold_coins ?? stats.coins ?? 0,
              silver_coins: stats.silver_coins ?? 0,
              coins: undefined
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to load user stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.name]);

  const tabs = [
    { id: 'profile', name: 'Profile', icon: '👤' },
    { id: 'friends', name: 'Friends', icon: '👥' },
    { id: 'history', name: 'History', icon: '📈' },
    { id: 'marketplace', name: 'Marketplace', icon: '🛒' },
    { id: 'store', name: 'Store', icon: '🪙' },
  ];

  const [showCoinStore, setShowCoinStore] = useState(false);

  const handleLogout = async () => {
    await signOut();
    onBack();
  };

  // Load user stats on component mount
  useEffect(() => {
    loadUserStats();
  }, [loadUserStats]);

  const handlePurchaseCoin = async () => {
    if (userStats.gold_coins >= PREMIUM_COIN_PIECE.price && !userStats.premium_piece_owned) {
      try {
        const sessionOk = await ensureApiSession(user?.name);
        if (!sessionOk) {
          console.error('Failed to establish session before purchasing premium piece');
          return;
        }
        const response = await fetch('/api/user/purchase-premium-piece', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: PREMIUM_COIN_PIECE.id })
        });
        
        if (response.ok) {
          const data = await response.json();
          setUserStats(prev => ({
            ...prev,
            gold_coins: data.remaining_coins ?? (prev.gold_coins - PREMIUM_COIN_PIECE.price),
            premium_piece_owned: true
          }));
          // Refresh from server to catch any additional fields (e.g., updated history)
          loadUserStats();
        }
      } catch (error) {
        console.error('Failed to purchase premium piece:', error);
      }
    }
  };

  const handleBalanceChange = useCallback((balance: number) => {
    setUserStats(prev => ({ ...prev, gold_coins: balance }));
  }, []);

  const renderProfile = () => (
    <div style={{ display: 'grid', gap: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* Profile Header */}
      <div className="ui-labelframe elev-2" style={{ padding: 20 }}>
        <div className="ui-title">Player Profile</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <div style={{ 
            width: 64, height: 64, borderRadius: '50%', 
            background: 'linear-gradient(135deg, var(--color-accent), #5d7bff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, color: 'white'
          }}>
            {userStats.premium_piece_owned ? '🪙' : '👤'}
          </div>
          <div>
            <div className="ui-h1" style={{ fontSize: 18, marginBottom: 4 }}>{user?.name || 'Player'}</div>
            <div className="ui-sm" style={{ opacity: 0.7 }}>@{user?.id?.split(':')[1] || 'unknown'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>🥇</span>
                <span className="ui-h2">{userStats.gold_coins} gold</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>�</span>
                <span className="ui-h2">{userStats.silver_coins} silver</span>
              </div>
              <button 
                onClick={() => setShowCoinStore(true)}
                className="btn btn-primary"
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                Buy Gold
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Grid */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="ui-labelframe elev-1">
          <div className="ui-title">Game Statistics</div>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="ui-sm">Games Played</span>
              <span className="ui-h2" style={{ color: 'var(--color-accent)' }}>{userStats.games_played}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="ui-sm">Games Won</span>
              <span className="ui-h2" style={{ color: 'var(--color-success)' }}>{userStats.games_won}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="ui-sm">Win Rate</span>
              <span className="ui-h2" style={{ color: 'var(--color-warning)' }}>{userStats.win_rate.toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="ui-sm">Total Earnings</span>
              <span className="ui-h2" style={{ color: 'var(--color-success)' }}>${userStats.total_earnings.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="ui-labelframe elev-1">
          <div className="ui-title">Achievements</div>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            {user?.achievements?.includes('early_adopter') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>�️</span>
                <div>
                  <div className="ui-h3">Early Adopter</div>
                  <div className="ui-xs" style={{ opacity: 0.7 }}>Joined during beta</div>
                </div>
              </div>
            )}
            {userStats.games_won > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🏆</span>
                <div>
                  <div className="ui-h3">First Victory</div>
                  <div className="ui-xs" style={{ opacity: 0.7 }}>Won your first game</div>
                </div>
              </div>
            )}
            {userStats.premium_piece_owned && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🪙</span>
                <div>
                  <div className="ui-h3">Premium Player</div>
                  <div className="ui-xs" style={{ opacity: 0.7 }}>Owns the premium 3D coin piece</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Account Settings */}
      <div className="ui-labelframe elev-1">
        <div className="ui-title">Account Settings</div>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="ui-sm">Email</span>
            <span className="ui-xs" style={{ opacity: 0.7 }}>{user?.email || 'Not provided'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="ui-sm">Member Since</span>
            <span className="ui-xs" style={{ opacity: 0.7 }}>{userStats.member_since}</span>
          </div>
          <div style={{ paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
            <button onClick={handleLogout} className="btn btn-danger">
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFriends = () => (
    <div className="space-y-6">
      <div className="text-center py-12">
        <div className="text-6xl mb-4">👥</div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Friends System</h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          Connect with other players, send friend requests, and see who's online. 
          Coming soon with social features!
        </p>
        <div className="mt-8 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-left max-w-md mx-auto">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Planned Features:</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Add friends by username</li>
              <li>• See online status</li>
              <li>• Private game invitations</li>
              <li>• Friend leaderboards</li>
              <li>• Chat with friends</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-6">
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📈</div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Game History</h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          Track your game performance, view detailed match history, and analyze your gameplay patterns.
        </p>
        <div className="mt-8 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-left max-w-md mx-auto">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Coming Features:</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Detailed match replays</li>
              <li>• Win/loss statistics</li>
              <li>• Property acquisition patterns</li>
              <li>• Average game duration</li>
              <li>• Performance trends</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMarketplace = () => (
    <div style={{ display: 'grid', gap: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Marketplace Header */}
      <div className="ui-labelframe elev-2" style={{ 
        background: 'linear-gradient(135deg, var(--color-accent), #5d7bff)',
        color: 'white',
        border: 'none'
      }}>
        <div className="ui-title" style={{ color: 'white', background: 'transparent' }}>3D Premium Marketplace</div>
        <div style={{ marginTop: 12 }}>
          <div className="ui-h2" style={{ marginBottom: 8 }}>Customize Your Game Piece</div>
          <div className="ui-sm" style={{ opacity: 0.9, marginBottom: 12 }}>
            Upgrade to a premium 3D coin piece with golden shimmer and depth
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>�</span>
            <span className="ui-h2">{userStats.gold_coins} gold coins available</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 18 }}>🥈</span>
            <span className="ui-sm">{userStats.silver_coins} silver coins (earned from wins)</span>
          </div>
        </div>
      </div>

      {/* Premium 3D Coin Item */}
      <div className="ui-labelframe elev-3" style={{ padding: 24 }}>
        <div className="ui-title">Premium 3D Coin Piece</div>
        <div style={{ display: 'grid', gap: 20, marginTop: 16 }}>
          {/* Coin Preview */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            padding: 20,
            background: 'linear-gradient(145deg, var(--color-surface-alt), var(--color-surface))',
            borderRadius: 12,
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ 
              width: 80, height: 60, 
              background: 'linear-gradient(135deg, #FFD700, #FFA500)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36,
              boxShadow: '0 8px 16px rgba(255, 215, 0, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
              transform: 'perspective(100px) rotateX(15deg)',
              marginBottom: 12
            }}>
              🪙
            </div>
            <div className="ui-h2" style={{ marginBottom: 4 }}>{PREMIUM_COIN_PIECE.name}</div>
            <div className="ui-xs" style={{ textAlign: 'center', opacity: 0.8, maxWidth: 300 }}>
              {PREMIUM_COIN_PIECE.description}
            </div>
          </div>

          {/* Purchase Section */}
          <div style={{ display: 'grid', gap: 16 }}>
            {userStats.premium_piece_owned ? (
              <div style={{ 
                background: 'var(--color-success)', 
                color: 'white', 
                padding: 16, 
                borderRadius: 8, 
                textAlign: 'center' 
              }}>
                <div className="ui-h2" style={{ marginBottom: 4 }}>✓ Owned</div>
                <div className="ui-xs">You own this premium piece! It will appear in your games.</div>
              </div>
            ) : (
              <>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: 16,
                  background: 'var(--color-surface-alt)',
                  borderRadius: 8
                }}>
                  <span className="ui-h2">Price:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>🪙</span>
                    <span className="ui-h1" style={{ fontSize: 18 }}>{PREMIUM_COIN_PIECE.price}</span>
                  </div>
                </div>
                
                <button
                  onClick={handlePurchaseCoin}
                  disabled={userStats.gold_coins < PREMIUM_COIN_PIECE.price}
                  className={userStats.gold_coins >= PREMIUM_COIN_PIECE.price ? 'btn btn-success' : 'btn'}
                  style={{ 
                    width: '100%', 
                    padding: '12px 24px',
                    ...(userStats.gold_coins < PREMIUM_COIN_PIECE.price ? { opacity: 0.5, cursor: 'not-allowed' } : {})
                  }}
                >
                  {userStats.gold_coins >= PREMIUM_COIN_PIECE.price ? 
                    `Purchase for ${PREMIUM_COIN_PIECE.price} coins` : 
                    'Insufficient Coins'
                  }
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* How to Earn Coins */}
      <div className="ui-labelframe elev-1" style={{ 
        background: 'var(--color-warning)', 
        color: 'var(--ui-dark)',
        border: '1px solid rgba(243, 156, 18, 0.3)'
      }}>
        <div className="ui-title" style={{ color: 'var(--ui-dark)', background: 'var(--color-warning)' }}>
          💡 How to Earn Coins
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            <div className="ui-sm">• Win games to earn silver coins (1 per victory)</div>
            <div className="ui-sm">• Silver coins unlock social rewards (coming soon)</div>
            <div className="ui-sm">• Purchase gold coins in the store for premium cosmetics</div>
            <div className="ui-sm">• Special events may award bonus silver or gold</div>
            <div className="ui-sm">• Daily login bonuses (coming soon)</div>
          </div>
          <div style={{ textAlign: 'center', paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
            <button
              onClick={() => setShowCoinStore(true)}
              className="btn btn-primary"
              style={{ padding: '8px 16px' }}
            >
              🛒 Visit Coin Store
            </button>
            <div className="ui-xs" style={{ marginTop: 4, opacity: 0.8 }}>
              Purchase coins with real money for instant delivery
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile': return renderProfile();
      case 'friends': return renderFriends();
      case 'history': return renderHistory();
      case 'marketplace': return renderMarketplace();
      case 'store':
        return (
          <CoinStorePage
            onBalanceChange={handleBalanceChange}
          />
        );
      default: return renderProfile();
    }
  };

  // Handle coin store navigation
  if (showCoinStore) {
    return (
      <CoinStorePage
        onBack={() => {
          setShowCoinStore(false);
          loadUserStats();
        }}
        onBalanceChange={handleBalanceChange}
      />
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontFamily: 'Arial, Helvetica, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        background: 'var(--color-surface)', 
        borderBottom: '1px solid var(--color-border)',
        boxShadow: 'var(--elev-1)'
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button 
                onClick={onBack}
                className="btn btn-ghost"
                style={{ padding: '8px 12px' }}
              >
                ← Back to Game
              </button>
              <div className="ui-h1" style={{ fontSize: 20 }}>
                Profile
              </div>
            </div>
            <button 
              onClick={toggleTheme}
              className="btn btn-ghost"
              style={{ padding: '8px 12px' }}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ 
        background: 'var(--color-surface)', 
        borderBottom: '1px solid var(--color-border)' 
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', gap: 32, overflowX: 'auto' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '16px 8px',
                  borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                  fontSize: 13,
                  fontWeight: activeTab === tab.id ? 'bold' : 'normal'
                }}
              >
                <span style={{ fontSize: 16 }}>{tab.icon}</span>
                <span>{tab.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="ui-h2">Loading profile...</div>
          </div>
        ) : (
          renderTabContent()
        )}
      </div>
    </div>
  );
};