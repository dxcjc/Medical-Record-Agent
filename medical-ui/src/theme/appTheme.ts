export type AppThemeMode = 'light' | 'dark';

export const appThemeTokens = {
  light: {
    primaryColor: '#3370ff',
    borderRadius: 8,
    colorBgBase: '#f7f8fa',
    colorTextBase: '#1d2129',
  },
  dark: {
    primaryColor: '#6aa1ff',
    borderRadius: 8,
    colorBgBase: '#111722',
    colorTextBase: '#f2f3f5',
  },
} as const satisfies Record<AppThemeMode, Record<string, string | number>>;
