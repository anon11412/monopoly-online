// If VITE_BACKEND_URL is not set, default to same-origin (used with Vite proxy in dev)
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || '';

// Use canonical Socket.IO path without trailing slash to avoid proxy mismatches
export const SOCKET_PATH = '/socket.io';

// Allow overriding board meta route if backend differs
export const BOARD_META_PATH = (import.meta.env.VITE_BOARD_META_PATH as string) || '/board_meta';

// Board layout orientation for fallback board (when /board_meta is unavailable)
// origin: which corner shows GO; direction: traversal direction from GO
export const BOARD_ORIGIN = (import.meta.env.VITE_BOARD_ORIGIN as 'bottom-right' | 'bottom-left' | 'top-left' | 'top-right') || 'top-left';
export const BOARD_DIRECTION = (import.meta.env.VITE_BOARD_DIRECTION as 'clockwise' | 'counterclockwise') || 'clockwise';

// Stripe Configuration
export const STRIPE_PUBLISHABLE_KEY = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string) || 'pk_test_51SCPAPGw95IEXtgzIGjm45OoZ7u5NlcLN922Hmd0Lw4IrGaFrQ24vayvmW4WwOm4YpHRAM6HHEL0dCgdk975jiUr00raPxroVn';
