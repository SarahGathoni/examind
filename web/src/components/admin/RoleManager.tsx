"use client";

import React, { useEffect, useState } from "react";
import { usersApi, schoolsApi } from "@/lib/api";
import type { UserOut, SchoolOut, UserCreate } from "@/lib/api";

type Role = "examiner" | "moderator" | "hod" | "admin";

const ROLE_LABELS: Record<Role, string> = {
  examiner: "Examiner",
  moderator: "Exam Moderator",
  hod: "Head of Department",
  admin: "Admin",
};

export function RoleManager() {
  const [users, setUsers] = useState<UserOut[]>([]);
  const [schools, setSchools] = useState<SchoolOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<UserCreate>({
    full_name: "",
    email: "",
    password: "",
    role: "examiner",
    school_id: "",
  });

  useEffect(() => {
    Promise.all([usersApi.list(), schoolsApi.list()])
      .then(([userList, schoolList]) => {
        setUsers(userList);
        setSchools(schoolList);
        if (schoolList.length > 0) {
          setDraft((d) => ({ ...d, school_id: schoolList[0].id }));
        }
      })
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.full_name.trim() || !draft.email.trim() || !draft.password.trim()) return;
    try {
      const user = await usersApi.create(draft);
      setUsers((prev) => [...prev, user]);
      setDraft((d) => ({ ...d, full_name: "", email: "", password: "" }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add user.");
    }
  }

  async function handleRoleChange(id: string, role: Role) {
    try {
      const updated = await usersApi.update(id, { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update role.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this user from ExamMind?")) return;
    try {
      await usersApi.remove(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove user.");
    }
  }

  if (loading) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 0" }}>
        Loading users…
      </div>
    );
  }

  return (
    <div className="card">
      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 9,
            background: "var(--red-lt)",
            border: "1px solid var(--red-bd)",
            fontSize: 12,
            color: "var(--red)",
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}
      <div className="card-title">
        👥 User Roles
        <span className="card-sub">Assign users to schools &amp; roles</span>
      </div>
      <table className="hist-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>School</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr>
              <td
                colSpan={5}
                style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}
              >
                No users yet. Add one below.
              </td>
            </tr>
          )}
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name}</td>
              <td>{u.email}</td>
              <td>{u.school_name ?? "—"}</td>
              <td>
                <select
                  className="form-select"
                  style={{ maxWidth: 160 }}
                  value={u.role}
                  onChange={(e) =>
                    handleRoleChange(u.id, e.target.value as Role)
                  }
                >
                  {(Object.entries(ROLE_LABELS) as [Role, string][]).map(
                    ([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </td>
              <td>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDelete(u.id)}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={handleAddUser} style={{ marginTop: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>
          + Add New User
        </div>
        <div className="grid-3">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              className="form-input"
              value={draft.full_name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, full_name: e.target.value }))
              }
              placeholder="Dr. Jane Doe"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={draft.email}
              onChange={(e) =>
                setDraft((d) => ({ ...d, email: e.target.value }))
              }
              placeholder="jane@university.ac.ke"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Temporary Password</label>
            <input
              className="form-input"
              type="password"
              value={draft.password}
              onChange={(e) =>
                setDraft((d) => ({ ...d, password: e.target.value }))
              }
              placeholder="Min. 8 characters"
            />
          </div>
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">School</label>
            <select
              className="form-select"
              value={draft.school_id ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, school_id: e.target.value }))
              }
            >
              <option value="">— No school —</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select
              className="form-select"
              value={draft.role}
              onChange={(e) =>
                setDraft((d) => ({ ...d, role: e.target.value as Role }))
              }
            >
              {(Object.entries(ROLE_LABELS) as [Role, string][]).map(
                ([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" type="submit">
          + Add User
        </button>
      </form>
    </div>
  );
}
