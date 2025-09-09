import { useState, useEffect } from 'react';

interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
  keyboardNavigation: boolean;
  screenReaderAnnouncements: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

const defaultSettings: AccessibilitySettings = {
  reducedMotion: false,
  highContrast: false,
  keyboardNavigation: true,
  screenReaderAnnouncements: true,
  fontSize: 'medium'
};

export function useAccessibility() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    try {
      const saved = localStorage.getItem('accessibility-settings');
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch {}
    
    // Check system preferences
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const highContrast = window.matchMedia('(prefers-contrast: high)').matches;
    
    return {
      ...defaultSettings,
      reducedMotion,
      highContrast
    };
  });

  useEffect(() => {
    localStorage.setItem('accessibility-settings', JSON.stringify(settings));
    
    // Apply CSS classes based on settings
    const root = document.documentElement;
    
    root.classList.toggle('a11y-reduced-motion', settings.reducedMotion);
    root.classList.toggle('a11y-high-contrast', settings.highContrast);
    root.classList.toggle('a11y-large-text', settings.fontSize === 'large');
    root.classList.toggle('a11y-small-text', settings.fontSize === 'small');
    
    // Set focus-visible polyfill
    if (settings.keyboardNavigation) {
      root.setAttribute('data-focus-visible-added', '');
    } else {
      root.removeAttribute('data-focus-visible-added');
    }
    
  }, [settings]);

  const updateSetting = <K extends keyof AccessibilitySettings>(
    key: K, 
    value: AccessibilitySettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return {
    settings,
    updateSetting
  };
}

export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite') {
  // Create a live region for screen reader announcements
  let liveRegion = document.getElementById('sr-live-region');
  
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'sr-live-region';
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
  }

  // Clear and set the message
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion.textContent = message;
  }, 100);
}

export function setupKeyboardNavigation() {
  let focusableElements: HTMLElement[] = [];

  const getFocusableElements = () => {
    const selectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'a[href]'
    ].join(', ');

    focusableElements = Array.from(document.querySelectorAll(selectors)) as HTMLElement[];
    focusableElements = focusableElements.filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Skip if user is typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key) {
      case 'Tab':
        // Let browser handle normal tab navigation
        break;
        
      case 'Enter':
      case ' ':
        // Activate focused element
        if (document.activeElement instanceof HTMLElement) {
          e.preventDefault();
          document.activeElement.click();
        }
        break;
        
      case 'Escape':
        // Close modals or return focus to main content
        const modal = document.querySelector('.modal, .overlay');
        if (modal) {
          const closeButton = modal.querySelector('button[aria-label*="close"], .close-button');
          if (closeButton instanceof HTMLElement) {
            closeButton.click();
          }
        }
        break;
        
      case 'ArrowUp':
      case 'ArrowDown':
        // Navigate between game actions when in action panel
        if (document.activeElement?.closest('.action-panel')) {
          e.preventDefault();
          getFocusableElements();
          const actionButtons = focusableElements.filter(el => 
            el.closest('.action-panel') && el.tagName === 'BUTTON'
          );
          
          if (actionButtons.length > 0) {
            const currentIndex = actionButtons.indexOf(document.activeElement as HTMLElement);
            let nextIndex;
            
            if (e.key === 'ArrowUp') {
              nextIndex = currentIndex > 0 ? currentIndex - 1 : actionButtons.length - 1;
            } else {
              nextIndex = currentIndex < actionButtons.length - 1 ? currentIndex + 1 : 0;
            }
            
            actionButtons[nextIndex].focus();
          }
        }
        break;
        
      case 'ArrowLeft':
      case 'ArrowRight':
        // Navigate between properties in trade panel
        if (document.activeElement?.closest('.trade-panel')) {
          e.preventDefault();
          getFocusableElements();
          const propertyCards = focusableElements.filter(el => 
            el.closest('.property-grid') && el.classList.contains('property-card')
          );
          
          if (propertyCards.length > 0) {
            const currentIndex = propertyCards.indexOf(document.activeElement as HTMLElement);
            let nextIndex;
            
            if (e.key === 'ArrowLeft') {
              nextIndex = currentIndex > 0 ? currentIndex - 1 : propertyCards.length - 1;
            } else {
              nextIndex = currentIndex < propertyCards.length - 1 ? currentIndex + 1 : 0;
            }
            
            propertyCards[nextIndex].focus();
          }
        }
        break;
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
}

// Enhanced focus management
export function trapFocus(container: HTMLElement) {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ) as NodeListOf<HTMLElement>;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  container.addEventListener('keydown', handleTabKey);
  
  // Focus first element
  if (firstElement) {
    firstElement.focus();
  }

  return () => {
    container.removeEventListener('keydown', handleTabKey);
  };
}

export default useAccessibility;
