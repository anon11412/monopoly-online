import { useEffect, useState } from 'react';
import { initGoogleAuth, promptGoogleSignIn, signOutGoogle } from './googleAuth';
import type { GoogleAuthResponse } from './googleAuth';

export type UserProfile = {
  id: string;
  email?: string | null;
  name: string;
  avatar?: string | null;
  achievements?: string[];
  provider?: 'google' | 'local';
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
  const [ready, setReady] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const RECENTS_KEY = 'auth.recentAccounts';

  function loadRecents(): Array<any> {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.slice(0, 8);
      return [];
    } catch { return []; }
  }

  function saveRecents(list: Array<any>) {
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0,8))); } catch {}
  }

  function rememberAccount(profile: UserProfile) {
    if (!profile?.id) return;
    const list = loadRecents();
    const existingIdx = list.findIndex((r: any) => r.id === profile.id);
    const entry = {
      id: profile.id,
      name: profile.name,
      provider: profile.provider || 'local',
      avatar: profile.avatar || null,
      lastUsed: Date.now()
    };
    if (existingIdx >= 0) list.splice(existingIdx, 1);
    list.unshift(entry);
    saveRecents(list);
  }

  // Initial auth bootstrap: try cookie session -> /auth/me -> then init Google
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Attempt to resume server session
        const r = await fetch('/auth/me', { credentials: 'include' });
        if (r.ok) {
          const data = await r.json();
          if (!cancelled && data?.user) {
            setUser(data.user);
            try { localStorage.setItem('user.profile', JSON.stringify(data.user)); } catch {}
            rememberAccount(data.user);
          }
        }
      } catch {/* ignore */}
      try {
        const success = await initGoogleAuth();
        if (!cancelled) setGoogleReady(success);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function signInWithGoogle(): Promise<void> {
    if (!googleReady) {
      throw new Error('Google Auth not ready');
    }

    return new Promise((resolve, reject) => {
      promptGoogleSignIn(async (response: GoogleAuthResponse) => {
        try {
          // Send the credential to our backend for verification
          const res = await fetch('/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ credential: response.credential }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || 'Google sign-in failed');
          }

          setUser(data.user);
          try { 
            localStorage.setItem('user.profile', JSON.stringify(data.user)); 
          } catch {}
          rememberAccount(data.user);
          
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async function signOut() {
    try { await fetch('/logout', { method: 'POST', credentials: 'include' }); } catch {}
    
    // Sign out from Google if user signed in with Google
    if (user?.provider === 'google') {
      signOutGoogle();
    }
    
    setUser(null);
    try { localStorage.removeItem('user.profile'); } catch {}
  }

  async function registerLocal(username: string, email: string | null, password: string, name?: string, remember = true) {
    const r = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, password, name, remember_me: remember }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'Register failed');
    setUser(data.user);
    try { localStorage.setItem('user.profile', JSON.stringify(data.user)); } catch {}
    rememberAccount(data.user);
  }

  async function loginLocal(identifier: string, password: string, remember = true) {
    const r = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier, password, remember_me: remember }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'Login failed');
    setUser(data.user);
    try { localStorage.setItem('user.profile', JSON.stringify(data.user)); } catch {}
    rememberAccount(data.user);
  }

  return { user, ready, googleReady, signOut, signInWithGoogle, registerLocal, loginLocal, loadRecents };
}
