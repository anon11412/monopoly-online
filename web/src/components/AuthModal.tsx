import React, { useState } from 'react';

interface AuthModalProps {
  isOpen: boolean;
  mode: 'login' | 'register';
  onClose: () => void;
  onLogin: (identifier: string, password: string) => Promise<void>;
  onRegister: (username: string, email: string | null, password: string, name?: string) => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  mode,
  onClose,
  onLogin,
  onRegister,
}) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        await onLogin(username, password);
      } else {
        await onRegister(username, email || null, password, name);
      }
      // Clear form on success
      setUsername('');
      setEmail('');
      setPassword('');
      setName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">
          {mode === 'login' ? 'Log In' : 'Create Account'}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">
                {mode === 'login' ? 'Username or Email' : 'Username'}
              </span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              placeholder={mode === 'login' ? 'Enter username or email' : 'Choose a username'}
            />
          </div>

          {mode === 'register' && (
            <>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Email (optional)</span>
                </label>
                <input
                  type="email"
                  className="input input-bordered"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Display Name (optional)</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How others will see you"
                />
              </div>
            </>
          )}

          <div className="form-control">
            <label className="label">
              <span className="label-text">Password</span>
            </label>
            <input
              type="password"
              className="input input-bordered"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`btn btn-primary ${isLoading ? 'loading' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? 'Please wait...' : (mode === 'login' ? 'Log In' : 'Create Account')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};