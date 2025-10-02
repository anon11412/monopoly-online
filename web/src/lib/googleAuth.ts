/**
 * Google OAuth 2.0 integration for client-side authentication
 */

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export interface GoogleAuthResponse {
  credential: string;
  clientId: string;
}

// Configuration - will be loaded from backend config endpoint
let googleClientId: string | null = null;

/**
 * Initialize Google Sign-In by loading the client ID from backend
 */
export async function initGoogleAuth(): Promise<boolean> {
  try {
    // Get Google client ID from backend
    const response = await fetch('/auth/config');
    if (!response.ok) {
      console.warn('Failed to load auth config from backend');
      return false;
    }
    
    const config = await response.json();
    googleClientId = config.googleClientId;
    
    if (!googleClientId) {
      console.warn('Google Client ID not configured');
      return false;
    }

    // Load Google Identity Services script
    if (!window.google) {
      await loadGoogleScript();
    }

    // Initialize Google Sign-In
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: () => {}, // Will be set by individual components
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    console.log('Google Auth initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize Google Auth:', error);
    return false;
  }
}

/**
 * Load Google Identity Services script dynamically
 */
function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google script'));
    document.head.appendChild(script);
  });
}

/**
 * Show Google Sign-In prompt
 */
export function promptGoogleSignIn(callback: (response: GoogleAuthResponse) => void): void {
  if (!window.google || !googleClientId) {
    throw new Error('Google Auth not initialized');
  }

  // Set the callback for this sign-in attempt
  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: callback,
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  // Show the One Tap prompt
  window.google.accounts.id.prompt((notification: any) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      console.log('Google Sign-In prompt not shown:', notification.getNotDisplayedReason());
      // Fallback: render sign-in button
      renderGoogleSignInButton(callback);
    }
  });
}

/**
 * Render Google Sign-In button as fallback
 */
function renderGoogleSignInButton(callback: (response: GoogleAuthResponse) => void): void {
  if (!window.google || !googleClientId) {
    return;
  }

  // Look for a container element, or create one
  let container = document.getElementById('google-signin-button');
  if (!container) {
    container = document.createElement('div');
    container.id = 'google-signin-button';
    container.style.position = 'fixed';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.zIndex = '9999';
    container.style.backgroundColor = 'white';
    container.style.padding = '20px';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    document.body.appendChild(container);
  }

  // Set callback
  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: callback,
  });

  // Render the button
  window.google.accounts.id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    type: 'standard',
    text: 'signin_with',
    shape: 'rectangular',
  });

  // Add close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '5px';
  closeBtn.style.right = '10px';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '20px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.onclick = () => {
    document.body.removeChild(container!);
  };
  container.appendChild(closeBtn);
}

/**
 * Decode Google JWT credential to extract user info
 */
export function decodeGoogleCredential(credential: string): GoogleUser | null {
  try {
    // JWT has 3 parts separated by dots
    const parts = credential.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Decode the payload (middle part)
    const payload = parts[1];
    // Add padding if needed for base64 decoding
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const user = JSON.parse(decoded);

    return {
      id: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
      given_name: user.given_name,
      family_name: user.family_name,
    };
  } catch (error) {
    console.error('Failed to decode Google credential:', error);
    return null;
  }
}

/**
 * Sign out from Google
 */
export function signOutGoogle(): void {
  if (window.google) {
    window.google.accounts.id.disableAutoSelect();
  }
}

// Global type declarations are in auth.ts