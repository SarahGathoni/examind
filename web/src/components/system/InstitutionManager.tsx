"use client";

import React, { useEffect, useState } from "react";
import { institutionsApi } from "@/lib/api";
import type { InstitutionOut } from "@/lib/api";

export function InstitutionManager() {
  const [institutions, setInstitutions] = useState<InstitutionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ name: "", code: "", country: "Kenya" });

  useEffect(() => {
    institutionsApi
      .list()
      .then(setInstitutions)
      .catch(() => setError("Failed to load institutions."))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.code.trim()) return;
    try {
      const inst = await institutionsApi.create({
        name: draft.name.trim(),
        code: draft.code.trim().toUpperCase(),
        country: draft.country.trim() || "Kenya",
      });
      setInstitutions((prev) => [...prev, inst]);
      setDraft({ name: "", code: "", country: "Kenya" });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to add institution."
      );
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this institution? This will remove all associated data.")) return;
    try {
      await institutionsApi.remove(id);
      setInstitutions((prev) => prev.filter((i) => i.id !== id));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete institution."
      );
    }
  }

  if (loading) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 0" }}>
        Loading institutions…
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
        🌍 Institutions
        <span className="card-sub">Universities registered in ExamMind</span>
      </div>
      <table className="hist-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Country</th>
            <th>Users</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {institutions.length === 0 && (
            <tr>
              <td
                colSpan={6}
                style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}
              >
                No institutions yet.
              </td>
            </tr>
          )}
          {institutions.map((i) => (
            <tr key={i.id}>
              <td>
                <strong>{i.name}</strong>
              </td>
              <td>
                <code style={{ fontSize: 11 }}>{i.code}</code>
              </td>
              <td>{i.country}</td>
              <td>{i.user_count ?? "—"}</td>
              <td>{new Date(i.created_at).toLocaleDateString()}</td>
              <td>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDelete(i.id)}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={handleAdd} style={{ marginTop: 16 }}>
        <div className="grid-3">
          <div className="form-group">
            <label className="form-label">Institution Name</label>
            <input
              className="form-input"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Kabarak University"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Code</label>
            <input
              className="form-input"
              value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
              placeholder="e.g. KABARAK"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Country</label>
            <input
              className="form-input"
              value={draft.country}
              onChange={(e) =>
                setDraft((d) => ({ ...d, country: e.target.value }))
              }
              placeholder="e.g. Kenya"
            />
          </div>
        </div>
        <button className="btn btn-primary btn-sm" type="submit">
          + Add Institution
        </button>
      </form>
    </div>
  );
}
