import { useEffect, useState } from 'react';

export type UserProfile = {
  id: string;
  email?: string | null;
  name: string;
  avatar?: string | null;
  achievements?: string[];
};

declare global {
  interface Window {
    google?: any;
  }
}

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const raw = localStorage.getItem('user.profile');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [ready, setReady] = useState(true);

  useEffect(() => { setReady(true); }, []);

  // Google sign-in removed

  async function signOut() {
    try { await fetch('/logout', { method: 'POST', credentials: 'include' }); } catch {}
    setUser(null);
    try { localStorage.removeItem('user.profile'); } catch {}
  }

  async function registerLocal(username: string, email: string | null, password: string, name?: string) {
    const r = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, password, name }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'Register failed');
    setUser(data.user);
    try { localStorage.setItem('user.profile', JSON.stringify(data.user)); } catch {}
  }

  async function loginLocal(identifier: string, password: string) {
    const r = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'Login failed');
    setUser(data.user);
    try { localStorage.setItem('user.profile', JSON.stringify(data.user)); } catch {}
  }

  return { user, ready, signOut, registerLocal, loginLocal };
}
