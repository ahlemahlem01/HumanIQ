"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

export type Role = "CANDIDATE" | "RECRUITER" | "ADMIN";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  candidate?: { id: string } | null;
  recruiter?: { id: string; companyId: string; company?: { name: string } } | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (
    payload: Record<string, unknown>,
  ) => Promise<AuthUser | { verificationRequired: true; email: string; delivered: boolean; verifyPath?: string }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("nextgen_token");
    if (!stored) {
      setLoading(false);
      return;
    }
    setToken(stored);
    api<AuthUser>("/auth/me", { token: stored })
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("nextgen_token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      async login(email, password) {
        const result = await api<{ token: string; user: AuthUser }>("/auth/login", {
          body: { email, password },
        });
        localStorage.setItem("nextgen_token", result.token);
        setToken(result.token);
        setUser(result.user);
        return result.user;
      },
      async register(payload) {
        const result = await api<
          | { token: string; user: AuthUser }
          | { verificationRequired: true; email: string; delivered: boolean; verifyPath?: string }
        >("/auth/register", { body: payload });
        if ("verificationRequired" in result) return result;
        localStorage.setItem("nextgen_token", result.token);
        setToken(result.token);
        setUser(result.user);
        return result.user;
      },
      logout() {
        localStorage.removeItem("nextgen_token");
        setToken(null);
        setUser(null);
      },
    }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}

export function homeFor(role: Role) {
  if (role === "RECRUITER") return "/recruteur";
  if (role === "ADMIN") return "/admin";
  return "/candidat";
}
