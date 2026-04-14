const TOKEN_KEY = "examind_token";
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (token) base["Authorization"] = `Bearer ${token}`;
  const headers = { ...base, ...(init?.headers as Record<string, string>) };

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail ?? `API error ${res.status}`
    );
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function apiFetchForm<T>(path: string, body: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail ?? `API error ${res.status}`
    );
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  me: () => apiFetch<AuthUser>("/api/auth/me"),
};

// ── Users ──────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: (params?: {
    institution_id?: string;
    school_id?: string;
    role?: string;
  }) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return apiFetch<UserOut[]>(`/api/users${qs}`);
  },
  create: (data: UserCreate) =>
    apiFetch<UserOut>("/api/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<UserCreate>) =>
    apiFetch<UserOut>(`/api/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/api/users/${id}`, { method: "DELETE" }),
};

// ── Institutions ──────────────────────────────────────────────────────────────
export const institutionsApi = {
  list: () => apiFetch<InstitutionOut[]>("/api/institutions"),
  create: (data: { name: string; code: string; country: string }) =>
    apiFetch<InstitutionOut>("/api/institutions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/api/institutions/${id}`, { method: "DELETE" }),
  stats: () => apiFetch<PlatformStats>("/api/institutions/stats"),
};

// ── Schools ────────────────────────────────────────────────────────────────────
export const schoolsApi = {
  list: (institution_id?: string) => {
    const qs = institution_id ? `?institution_id=${institution_id}` : "";
    return apiFetch<SchoolOut[]>(`/api/schools${qs}`);
  },
  create: (data: { name: string }) =>
    apiFetch<SchoolOut>("/api/schools", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/api/schools/${id}`, { method: "DELETE" }),
};

// ── Moderation Forms ───────────────────────────────────────────────────────────
export const formsApi = {
  list: (school_id: string) =>
    apiFetch<ModerationFormOut[]>(`/api/forms?school_id=${school_id}`),
  upload: (school_id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("school_id", school_id);
    return apiFetchForm<ModerationFormOut>("/api/forms", fd);
  },
  remove: (id: string) =>
    apiFetch<void>(`/api/forms/${id}`, { method: "DELETE" }),
};

// ── Submissions ────────────────────────────────────────────────────────────────
export const submissionsApi = {
  list: () => apiFetch<SubmissionOut[]>("/api/submissions"),
  get: (id: string) => apiFetch<SubmissionOut>("/api/submissions/" + id),
  create: (file: File, meta: SubmissionCreate) => {
    const fd = new FormData();
    fd.append("exam_file", file);
    Object.entries(meta).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, String(v));
    });
    return apiFetchForm<SubmissionOut>("/api/submissions", fd);
  },
  reportUrl: (id: string) => `${API_BASE}/api/submissions/${id}/report`,
};

// ── AI Config ──────────────────────────────────────────────────────────────────
export const aiConfigApi = {
  get: () => apiFetch<AiConfigOut | null>("/api/ai-config"),
  save: (data: { provider: string; api_key: string }) =>
    apiFetch<AiConfigOut>("/api/ai-config", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ── Platform Stats ─────────────────────────────────────────────────────────────
export const statsApi = {
  platform: () => apiFetch<PlatformStats>("/api/institutions/stats"),
  institution: () => apiFetch<InstitutionStats>("/api/submissions/stats"),
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: "system_admin" | "admin" | "hod" | "moderator" | "examiner";
  institution_id: string | null;
  institution_name: string | null;
  school_id: string | null;
  school_name: string | null;
  is_active: boolean;
}

export interface UserOut extends AuthUser {}

export interface UserCreate {
  email: string;
  full_name: string;
  password: string;
  role: string;
  institution_id?: string;
  school_id?: string;
}

export interface InstitutionOut {
  id: string;
  name: string;
  code: string;
  country: string;
  created_at: string;
  user_count?: number;
}

export interface SchoolOut {
  id: string;
  name: string;
  institution_id: string;
  created_at: string;
}

export interface ModerationFormOut {
  id: string;
  name: string;
  filename: string;
  school_id: string;
  institution_id: string;
  created_at: string;
}

export interface SubmissionOut {
  id: string;
  reference: string;
  course_name: string;
  department: string;
  level: string;
  duration: string;
  total_marks: string;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
  user_full_name?: string;
  school_name?: string;
  overall_score?: number;
  verdict?: string;
  report_filename?: string;
}

export interface SubmissionCreate {
  course_name: string;
  department: string;
  level: string;
  duration: string;
  total_marks: string;
  school_id?: string;
  form_id?: string;
}

export interface AiConfigOut {
  id: string;
  institution_id: string;
  provider: string;
  updated_at: string;
}

export interface PlatformStats {
  total_institutions: number;
  total_users: number;
  total_submissions: number;
  approved_count: number;
  needs_revision_count: number;
  avg_score: number;
}

export interface InstitutionStats {
  total_submissions: number;
  approved_count: number;
  needs_revision_count: number;
  avg_score: number;
}
