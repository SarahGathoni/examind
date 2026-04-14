"use client";

import React, { useEffect, useRef, useState } from "react";
import { schoolsApi, formsApi } from "@/lib/api";
import type { SchoolOut, ModerationFormOut } from "@/lib/api";

export function SchoolManager() {
  const [schools, setSchools] = useState<SchoolOut[]>([]);
  const [forms, setForms] = useState<ModerationFormOut[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSchools();
  }, []);

  async function loadSchools() {
    try {
      const list = await schoolsApi.list();
      setSchools(list);
      if (list.length > 0) {
        setSelectedId(list[0].id);
        await loadForms(list[0].id);
      }
    } catch {
      setError("Failed to load schools.");
    } finally {
      setLoading(false);
    }
  }

  async function loadForms(schoolId: string) {
    try {
      const list = await formsApi.list(schoolId);
      setForms(list);
    } catch {
      setForms([]);
    }
  }

  async function handleSelectSchool(id: string) {
    setSelectedId(id);
    await loadForms(id);
  }

  async function handleAddSchool(e: React.FormEvent) {
    e.preventDefault();
    if (!newSchoolName.trim()) return;
    try {
      const school = await schoolsApi.create({ name: newSchoolName.trim() });
      setSchools((prev) => [...prev, school]);
      setNewSchoolName("");
      setSelectedId(school.id);
      setForms([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add school.");
    }
  }

  async function handleDeleteSchool(id: string) {
    if (!confirm("Delete this school? This will also remove its moderation forms.")) return;
    try {
      await schoolsApi.remove(id);
      const remaining = schools.filter((s) => s.id !== id);
      setSchools(remaining);
      if (selectedId === id) {
        const next = remaining[0];
        setSelectedId(next?.id ?? "");
        if (next) await loadForms(next.id);
        else setForms([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete school.");
    }
  }

  async function handleUploadForm(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    try {
      const form = await formsApi.upload(selectedId, file);
      setForms((prev) => [...prev, form]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
    e.target.value = "";
  }

  async function handleDeleteForm(formId: string) {
    try {
      await formsApi.remove(formId);
      setForms((prev) => prev.filter((f) => f.id !== formId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove form.");
    }
  }

  const selectedSchool = schools.find((s) => s.id === selectedId);

  if (loading) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 0" }}>
        Loading schools…
      </div>
    );
  }

  return (
    <>
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
      <div className="grid-2" style={{ gap: 16 }}>
        {/* Schools list */}
        <div className="card">
          <div className="card-title">
            🏫 Schools
            <span className="card-sub">Manage faculties / schools</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            {schools.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                No schools yet. Add one below.
              </div>
            )}
            {schools.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  borderRadius: 9,
                  border:
                    selectedId === s.id
                      ? "1.5px solid var(--blue2)"
                      : "1px solid var(--border)",
                  background:
                    selectedId === s.id ? "var(--blue-lt)" : "var(--white)",
                  marginBottom: 6,
                  cursor: "pointer",
                }}
                onClick={() => handleSelectSchool(s.id)}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {new Date(s.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSchool(s.id);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddSchool}>
            <div className="form-group">
              <label className="form-label">New School Name</label>
              <input
                className="form-input"
                placeholder="e.g. School of Pharmacy"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">
              + Add School
            </button>
          </form>
        </div>

        {/* Forms for selected school */}
        <div className="card">
          <div className="card-title">
            📋 Moderation Forms
            <span className="card-sub">Forms used by AI for this school</span>
          </div>
          {selectedSchool ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 10, color: "var(--muted)" }}>
                <strong>{selectedSchool.name}</strong>
              </div>
              <div style={{ marginBottom: 10 }}>
                {forms.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "var(--blue-lt)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                      }}
                    >
                      📄
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        Uploaded {new Date(f.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDeleteForm(f.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {forms.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "6px 0" }}>
                    No moderation forms uploaded yet for this school.
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                style={{ display: "none" }}
                onChange={handleUploadForm}
              />
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                + Upload Moderation Form
              </button>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Select a school on the left to manage its moderation forms.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
