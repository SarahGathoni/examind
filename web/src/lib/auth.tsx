"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";

export type UserRole =
  | "system_admin"
  | "admin"
  | "hod"
  | "moderator"
  | "examiner";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  institution_id: string | null;
  institution_name: string | null;
  school_id: string | null;
  school_name: string | null;
  is_active: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "examind_token";
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restore session on mount
  useEffect(() => {
    const storedToken =
      typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!storedToken) {
      setIsLoading(false);
      return;
    }
    setToken(storedToken);
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid token");
        return res.json();
      })
      .then((data: AuthUser) => {
        setUser(data);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        document.cookie = `examind_token=; path=/; max-age=0`;
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Login failed");
      }
      const data = await res.json();
      const jwt: string = data.access_token;
      const userData: AuthUser = data.user;

      localStorage.setItem(TOKEN_KEY, jwt);
      // Also set cookie so Next.js middleware can read it
      document.cookie = `examind_token=${jwt}; path=/; max-age=${8 * 3600}; SameSite=Lax`;
      setToken(jwt);
      setUser(userData);

      // Role-based redirect
      if (userData.role === "system_admin") {
        router.replace("/system-admin");
      } else if (userData.role === "admin") {
        router.replace("/admin");
      } else {
        router.replace("/");
      }
    },
    [router]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    document.cookie = `examind_token=; path=/; max-age=0`;
    setToken(null);
    setUser(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Guard hook: redirects to /login if not authenticated,
 * or to the user's own dashboard if they don't have the required role.
 */
export function useRequireAuth(allowedRoles?: UserRole[]) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      if (user.role === "system_admin") router.replace("/system-admin");
      else if (user.role === "admin") router.replace("/admin");
      else router.replace("/");
    }
  }, [user, isLoading, allowedRoles, router]);

  return { user, isLoading };
}

export function roleLabel(role: UserRole): string {
  const map: Record<UserRole, string> = {
    system_admin: "System Admin",
    admin: "Institution Admin",
    hod: "Head of Department",
    moderator: "Exam Moderator",
    examiner: "Examiner",
  };
  return map[role] ?? role;
}

export function userInitials(fullName: string): string {
  return fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
