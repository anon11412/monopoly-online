import { useEffect, useRef, useCallback } from 'react';

export interface UseAutoScrollOptions {
  smooth?: boolean;
  enabled?: boolean;
  threshold?: number; // pixels from bottom to consider "at bottom"
}

export function useAutoScroll<T extends HTMLElement>(
  dependencies: React.DependencyList,
  options: UseAutoScrollOptions = {}
) {
  const { smooth = false, enabled = true, threshold = 50 } = options;
  const ref = useRef<T | null>(null);
  const isUserScrollingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Scroll to bottom function
  const scrollToBottom = useCallback((force = false) => {
    const element = ref.current;
    if (!element || (!enabled && !force)) return;

    const isAtBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
    
    if (force || (!isUserScrollingRef.current && (isAtBottom || element.scrollTop === 0))) {
      if (smooth) {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      } else {
        element.scrollTop = element.scrollHeight;
      }
    }
  }, [enabled, smooth, threshold]);

  // Handle user scroll detection
  const handleScroll = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    // Check if user scrolled away from bottom
    const isAtBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
    
    if (!isAtBottom) {
      isUserScrollingRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 1500); // Give user time to read
    } else {
      // User is at bottom, allow auto-scroll
      isUserScrollingRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    }
  }, [threshold]);

  // Auto-scroll on dependencies change
  useEffect(() => {
    scrollToBottom();
  }, dependencies);

  // Setup scroll listener
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [handleScroll]);

  return { ref, scrollToBottom };
}