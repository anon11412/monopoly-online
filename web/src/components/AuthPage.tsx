import React, { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

interface AuthPageProps {
  mode: 'login' | 'register';
  onBack: () => void;
  onSwitchMode: (mode: 'login' | 'register') => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode, onBack, onSwitchMode }) => {
  const { loginLocal, registerLocal } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        await loginLocal(username, password, remember);
      } else {
        await registerLocal(username, email || null, password, name, remember);
      }
      setSuccess(true);
      // Faster return to menu so lobby UI updates instantly
      setTimeout(() => onBack(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif'
      }}>
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {mode === 'login' ? 'Welcome back!' : 'Account created!'}
          </h2>
          <p className="text-gray-600 dark:text-gray-300">
            {mode === 'login' ? 'Logging you in...' : 'Welcome to Monopoly Online!'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      background: 'var(--color-bg)',
      fontFamily: 'Arial, Helvetica, sans-serif'
    }}>
      <div style={{ 
        maxWidth: 480, 
        width: '100%',
        background: 'var(--color-surface)',
        borderRadius: 12,
        boxShadow: 'var(--elev-4)',
        overflow: 'hidden',
        border: '1px solid var(--color-border)'
      }}>
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, var(--color-accent), #5d7bff)',
          padding: 24,
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button 
              onClick={onBack}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              ← Back to Menu
            </button>
            <button 
              onClick={toggleTheme}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                fontSize: 16
              }}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
          <div className="ui-h1" style={{ fontSize: 24, marginBottom: 8, color: 'white' }}>
            InvestUp.trade
          </div>
          <div className="ui-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
            {mode === 'login' ? 'Welcome back!' : 'Join the strategic Monopoly experience!'}
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: 32 }}>
          <div style={{ display: 'flex', marginBottom: 24, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <button 
              onClick={() => onSwitchMode('login')}
              className={mode === 'login' ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{ 
                flex: 1, 
                borderRadius: 0,
                border: 'none',
                borderRight: mode === 'login' ? 'none' : '1px solid var(--color-border)'
              }}
            >
              Log In
            </button>
            <button 
              onClick={() => onSwitchMode('register')}
              className={mode === 'register' ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{ 
                flex: 1, 
                borderRadius: 0,
                border: 'none'
              }}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
            <div className="ui-labelframe">
              <div className="ui-title">
                {mode === 'login' ? 'Username or Email' : 'Username'}
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                style={{ 
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 4,
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: 14,
                  marginTop: 8
                }}
                placeholder={mode === 'login' ? 'Enter username or email' : 'Choose a username'}
              />
            </div>

            {mode === 'register' && (
              <>
                <div className="ui-labelframe">
                  <div className="ui-title">
                    Email <span className="ui-xs" style={{ opacity: 0.7 }}>(optional)</span>
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ 
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 4,
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      fontSize: 14,
                      marginTop: 8
                    }}
                    placeholder="your@email.com"
                  />
                </div>

                <div className="ui-labelframe">
                  <div className="ui-title">
                    Display Name <span className="ui-xs" style={{ opacity: 0.7 }}>(optional)</span>
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ 
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 4,
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      fontSize: 14,
                      marginTop: 8
                    }}
                    placeholder="How others will see you"
                  />
                  <div className="ui-xs" style={{ opacity: 0.7, marginTop: 4 }}>
                    Leave blank to use your username
                  </div>
                </div>
              </>
            )}

            <div className="ui-labelframe">
              <div className="ui-title">Password</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : 4}
                style={{ 
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 4,
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: 14,
                  marginTop: 8
                }}
                placeholder="Enter your password"
              />
              {mode === 'register' && (
                <div className="ui-xs" style={{ opacity: 0.7, marginTop: 4 }}>
                  Minimum 8 characters (longer is better)
                </div>
              )}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input id="remember_me" type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} />
              <label htmlFor="remember_me" className="ui-xs" style={{ cursor:'pointer', userSelect:'none' }}>
                Remember this device (90 days)
              </label>
            </div>

            {error && (
              <div style={{ 
                background: 'var(--color-danger)',
                color: 'white',
                padding: 12,
                borderRadius: 4,
                border: '1px solid var(--color-danger)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚠️</span>
                  <span className="ui-sm">{error}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
              style={{ 
                width: '100%',
                padding: '12px 24px',
                ...(isLoading ? { opacity: 0.7, cursor: 'wait' } : {})
              }}
            >
              {isLoading ? (
                <>⏳ {mode === 'login' ? 'Logging in...' : 'Creating account...'}</>
              ) : (
                mode === 'login' ? 'Log In' : 'Create Account'
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', paddingTop: 16 }}>
            {mode === 'login' ? (
              <div className="ui-sm" style={{ opacity: 0.8 }}>
                Don't have an account?{' '}
                <button 
                  onClick={() => onSwitchMode('register')}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: 'var(--color-accent)', 
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Sign up here
                </button>
              </div>
            ) : (
              <div className="ui-sm" style={{ opacity: 0.8 }}>
                Already have an account?{' '}
                <button 
                  onClick={() => onSwitchMode('login')}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: 'var(--color-accent)', 
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Log in here
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};