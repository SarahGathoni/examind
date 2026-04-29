"use client";

import React, { useEffect, useState } from "react";
import { institutionsApi, invitationsApi } from "@/lib/api";
import type { InstitutionOut, InviteOut } from "@/lib/api";

type AddMode = "manual" | "invite";

export function InstitutionManager() {
  const [institutions, setInstitutions] = useState<InstitutionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addMode, setAddMode] = useState<AddMode>("manual");

  // Manual creation state
  const [draft, setDraft] = useState({ name: "", code: "", country: "Kenya" });

  // Invite state
  const [invite, setInvite] = useState({
    institution_name: "",
    institution_code: "",
    institution_country: "Kenya",
    email: "",
  });
  const [inviteResult, setInviteResult] = useState<InviteOut | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    institutionsApi
      .list()
      .then(setInstitutions)
      .catch((err: unknown) =>
        setError(err instanceof Error ? `Failed to load institutions: ${err.message}` : "Failed to load institutions.")
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.code.trim()) return;
    setError("");
    try {
      const inst = await institutionsApi.create({
        name: draft.name.trim(),
        code: draft.code.trim().toUpperCase(),
        country: draft.country.trim() || "Kenya",
      });
      setInstitutions((prev) => [...prev, inst]);
      setDraft({ name: "", code: "", country: "Kenya" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add institution.");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!invite.institution_name.trim() || !invite.institution_code.trim() || !invite.email.trim()) return;
    setError("");
    setInviteLoading(true);
    try {
      const result = await invitationsApi.create({
        institution_name: invite.institution_name.trim(),
        institution_code: invite.institution_code.trim().toUpperCase(),
        institution_country: invite.institution_country.trim() || "Kenya",
        email: invite.email.trim(),
      });
      setInviteResult(result);
      // Add the new institution to the list
      setInstitutions((prev) => [
        ...prev,
        {
          id: result.institution_id,
          name: result.institution_name,
          code: invite.institution_code.trim().toUpperCase(),
          country: invite.institution_country.trim() || "Kenya",
          created_at: new Date().toISOString(),
          user_count: 0,
        },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invitation.");
    } finally {
      setInviteLoading(false);
    }
  }

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this institution? This will remove all associated data.")) return;
    try {
      await institutionsApi.remove(id);
      setInstitutions((prev) => prev.filter((i) => i.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete institution.");
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
              <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                No institutions yet.
              </td>
            </tr>
          )}
          {institutions.map((i) => (
            <tr key={i.id}>
              <td><strong>{i.name}</strong></td>
              <td><code style={{ fontSize: 11 }}>{i.code}</code></td>
              <td>{i.country}</td>
              <td>{i.user_count ?? "—"}</td>
              <td>{new Date(i.created_at).toLocaleDateString()}</td>
              <td>
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(i.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mode toggle */}
      <div style={{ marginTop: 20, marginBottom: 14, display: "flex", gap: 8 }}>
        <button
          className={`btn btn-sm ${addMode === "manual" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => { setAddMode("manual"); setInviteResult(null); setError(""); }}
        >
          + Add Manually
        </button>
        <button
          className={`btn btn-sm ${addMode === "invite" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => { setAddMode("invite"); setInviteResult(null); setError(""); }}
        >
          ✉ Send Invite Link
        </button>
      </div>

      {/* Manual add form */}
      {addMode === "manual" && (
        <form onSubmit={handleAdd}>
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
                onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))}
                placeholder="e.g. Kenya"
              />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
            After adding, assign an admin user via the Users section.
          </p>
          <button className="btn btn-primary btn-sm" type="submit">
            + Add Institution
          </button>
        </form>
      )}

      {/* Invite form */}
      {addMode === "invite" && !inviteResult && (
        <form onSubmit={handleInvite}>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Institution Name</label>
              <input
                className="form-input"
                value={invite.institution_name}
                onChange={(e) => setInvite((d) => ({ ...d, institution_name: e.target.value }))}
                placeholder="e.g. Strathmore University"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Code</label>
              <input
                className="form-input"
                value={invite.institution_code}
                onChange={(e) => setInvite((d) => ({ ...d, institution_code: e.target.value }))}
                placeholder="e.g. STRATH"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Country</label>
              <input
                className="form-input"
                value={invite.institution_country}
                onChange={(e) => setInvite((d) => ({ ...d, institution_country: e.target.value }))}
                placeholder="e.g. Kenya"
              />
            </div>
          </div>
          <div className="form-group" style={{ maxWidth: 340 }}>
            <label className="form-label">Admin Email</label>
            <input
              className="form-input"
              type="email"
              value={invite.email}
              onChange={(e) => setInvite((d) => ({ ...d, email: e.target.value }))}
              placeholder="admin@strathmore.edu"
            />
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
            An invite link (valid 72 hours) will be generated. An email is also sent if SMTP is configured.
          </p>
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={inviteLoading}
          >
            {inviteLoading ? "Sending…" : "Create Institution & Send Invite"}
          </button>
        </form>
      )}

      {/* Invite success */}
      {addMode === "invite" && inviteResult && (
        <div
          style={{
            marginTop: 4,
            padding: "16px 18px",
            borderRadius: 10,
            background: "var(--green-lt, #f0fdf4)",
            border: "1px solid var(--green-bd, #bbf7d0)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--green, #16a34a)", marginBottom: 6 }}>
            ✓ Institution created
          </div>
          {inviteResult.email_sent ? (
            <p style={{ fontSize: 13, color: "var(--fg)", margin: "0 0 10px" }}>
              An invite email was sent to <strong>{inviteResult.email}</strong>.
              Share the link below as a backup in case it lands in spam.
            </p>
          ) : (
            <p style={{ fontSize: 13, color: "var(--fg)", margin: "0 0 10px" }}>
              Email not configured — share this invite link directly with{" "}
              <strong>{inviteResult.email}</strong>:
            </p>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              readOnly
              className="form-input"
              style={{ fontSize: 12, flex: 1 }}
              value={inviteResult.invite_url}
            />
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => handleCopy(inviteResult.invite_url)}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 12 }}
            onClick={() => {
              setInviteResult(null);
              setInvite({ institution_name: "", institution_code: "", institution_country: "Kenya", email: "" });
            }}
          >
            Invite another
          </button>
        </div>
      )}
    </div>
  );
}
