import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useThemeState, ThemeContext } from './lib/theme'

function AppWithTheme() {
  const themeValue = useThemeState();
  
  return (
    <ThemeContext.Provider value={themeValue}>
      <App />
    </ThemeContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithTheme />
  </StrictMode>,
)
