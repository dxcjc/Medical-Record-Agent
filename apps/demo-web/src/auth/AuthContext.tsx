import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createApiClient, type ApiClient, type LoginResponse } from "../api/client";

type StoredAuth = {
  token: string;
  user: LoginResponse["user"];
  permissions: string[];
  roles: string[];
};

type AuthContextValue = {
  auth: StoredAuth | null;
  api: ApiClient;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => void;
};

const storageKey = "medical-record-agent.auth";
const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function writeStoredAuth(auth: StoredAuth | null) {
  if (!auth) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(auth));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());
  const api = useMemo(
    () =>
      createApiClient({
        getToken: () => auth?.token ?? null
      }),
    [auth?.token]
  );

  async function login(input: { email: string; password: string }) {
    const response = await api.login(input);
    const nextAuth: StoredAuth = {
      token: response.accessToken,
      user: response.user,
      permissions: response.permissions,
      roles: response.roles
    };
    setAuth(nextAuth);
    writeStoredAuth(nextAuth);
  }

  function logout() {
    setAuth(null);
    writeStoredAuth(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      auth,
      api,
      isAuthenticated: Boolean(auth),
      hasPermission: (permission) => Boolean(auth?.permissions.includes(permission)),
      login,
      logout
    }),
    [api, auth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth 必须在 AuthProvider 内使用");
  }

  return value;
}
