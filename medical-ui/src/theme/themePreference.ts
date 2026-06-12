import type { AppThemeMode } from './appTheme';

export const THEME_PREFERENCE_STORAGE_KEY = 'medical-app-theme-mode';

function getBrowserWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function getBrowserStorage(): Storage | null {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return null;
  try {
    return browserWindow.localStorage ?? null;
  } catch {
    return null;
  }
}

export function isAppThemeMode(value: unknown): value is AppThemeMode {
  return value === 'light' || value === 'dark';
}

export function getStoredThemePreference(): AppThemeMode | null {
  const storage = getBrowserStorage();
  try {
    const value = storage?.getItem(THEME_PREFERENCE_STORAGE_KEY);
    return isAppThemeMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function getSystemThemePreference(): AppThemeMode {
  const browserWindow = getBrowserWindow();
  if (!browserWindow?.matchMedia) return 'light';
  try {
    return browserWindow.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function resolveInitialThemeMode(): AppThemeMode {
  return getStoredThemePreference() ?? getSystemThemePreference();
}

export function persistThemePreference(mode: AppThemeMode) {
  const storage = getBrowserStorage();
  try {
    storage?.setItem(THEME_PREFERENCE_STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable
  }
}
