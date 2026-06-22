import { ConfigProvider } from '@arco-design/web-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { appThemeTokens, type AppThemeMode } from './appTheme';
import { persistThemePreference, resolveInitialThemeMode } from './themePreference';

type AppThemeContextValue = {
  mode: AppThemeMode;
  toggleMode: () => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function useAppTheme() {
  const value = useContext(AppThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return value;
}

export default function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppThemeMode>(() => resolveInitialThemeMode());

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', mode);
    document.body.setAttribute('arco-theme', mode);
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((value) => {
      const nextMode = value === 'light' ? 'dark' : 'light';
      persistThemePreference(nextMode);
      return nextMode;
    });
  }, []);

  const contextValue = useMemo<AppThemeContextValue>(() => ({
    mode,
    toggleMode,
  }), [mode, toggleMode]);

  return (
    <AppThemeContext.Provider value={contextValue}>
      <ConfigProvider theme={appThemeTokens[mode]}>
        {children}
      </ConfigProvider>
    </AppThemeContext.Provider>
  );
}
