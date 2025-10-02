import React, { useState } from 'react';
import type { UserProfile } from '../lib/auth';
import { CoinStorePage } from './CoinStorePage';

interface ProfileModalProps {
  isOpen: boolean;
  user: UserProfile;
  onClose: () => void;
}

type TabType = 'profile' | 'friends' | 'history' | 'marketplace' | 'store';

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  user,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  if (!isOpen) return null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {user.avatar ? (
                <img 
                  src={user.avatar} 
                  alt={user.name} 
                  className="w-16 h-16 rounded-full"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xl font-bold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-xl font-bold">{user.name}</h3>
                {user.email && <p className="text-gray-600">{user.email}</p>}
                <p className="text-sm text-gray-500">ID: {user.id}</p>
                <p className="text-sm text-gray-500">Provider: {user.provider}</p>
              </div>
            </div>
            
            {user.achievements && user.achievements.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Achievements</h4>
                <div className="flex flex-wrap gap-2">
                  {user.achievements.map((achievement, index) => (
                    <span 
                      key={index} 
                      className="badge badge-primary"
                    >
                      {achievement === 'early_adopter' ? '🎖 Early Adopter' : achievement}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div>
              <h4 className="font-semibold mb-2">Account Settings</h4>
              <div className="space-y-2">
                <button className="btn btn-outline btn-sm w-full">Edit Profile</button>
                <button className="btn btn-outline btn-sm w-full">Change Password</button>
                <button className="btn btn-outline btn-sm w-full">Privacy Settings</button>
              </div>
            </div>
          </div>
        );

      case 'friends':
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Friends</h3>
              <button className="btn btn-primary btn-sm">Add Friend</button>
            </div>
            
            <div className="tabs tabs-boxed">
              <a className="tab tab-active">Online (0)</a>
              <a className="tab">All Friends (0)</a>
              <a className="tab">Requests (0)</a>
            </div>
            
            <div className="min-h-[200px] flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p>👥</p>
                <p>No friends yet</p>
                <p className="text-sm">Invite friends to play Monopoly together!</p>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Invite Friends</h4>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter username or email" 
                  className="input input-bordered flex-1"
                />
                <button className="btn btn-primary">Send Invite</button>
              </div>
            </div>
          </div>
        );

      case 'history':
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Game History</h3>
              <select className="select select-bordered select-sm">
                <option>All Games</option>
                <option>Won</option>
                <option>Lost</option>
                <option>This Week</option>
              </select>
            </div>
            
            <div className="stats shadow w-full">
              <div className="stat">
                <div className="stat-title">Games Played</div>
                <div className="stat-value text-primary">0</div>
              </div>
              <div className="stat">
                <div className="stat-title">Win Rate</div>
                <div className="stat-value text-secondary">0%</div>
              </div>
              <div className="stat">
                <div className="stat-title">Avg Game Time</div>
                <div className="stat-value text-accent">--</div>
              </div>
            </div>
            
            <div className="min-h-[200px] flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p>🎲</p>
                <p>No games played yet</p>
                <p className="text-sm">Start your first game to see your history here!</p>
              </div>
            </div>
          </div>
        );

      case 'store':
        return <CoinStorePage />;

      case 'marketplace':
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Marketplace</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Premium Coin: 50 coins</span>
                <button className="btn btn-primary btn-sm">Buy Premium Coin</button>
              </div>
            </div>
            
            <div className="card bg-gradient-to-br from-yellow-100 to-amber-200 border-2 border-yellow-400">
              <div className="card-body p-6 text-center">
                <div className="text-6xl mb-4">🪙</div>
                <h3 className="text-xl font-bold text-yellow-800 mb-2">Premium 3D Coin</h3>
                <p className="text-yellow-700 mb-4">Unlock the exclusive 3D coin game piece - a symbol of wealth and prestige!</p>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-2xl font-bold text-yellow-800">50</span>
                  <span className="text-lg text-yellow-700">coins</span>
                </div>
                <button className="btn btn-warning">Purchase Premium Coin</button>
              </div>
            </div>
            
            <div className="text-center text-gray-500 py-4">
              <p className="text-sm">More marketplace items coming soon!</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-4xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Profile</h2>
          <button 
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        <div className="tabs tabs-lifted tabs-lg mb-4">
          <button 
            className={`tab ${activeTab === 'profile' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            👤 Profile
          </button>
          <button 
            className={`tab ${activeTab === 'friends' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            👥 Friends
          </button>
          <button 
            className={`tab ${activeTab === 'history' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📈 History
          </button>
          <button 
            className={`tab ${activeTab === 'store' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('store')}
          >
            💰 Store
          </button>
          <button 
            className={`tab ${activeTab === 'marketplace' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('marketplace')}
          >
            🛒 Marketplace
          </button>
        </div>
        
        <div className="min-h-[400px]">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};