"use client";

// @ts-nocheck

import React, { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SchoolManager } from "@/components/admin/SchoolManager";
import { RoleManager } from "@/components/admin/RoleManager";
// SchoolManager and RoleManager are self-contained — no props needed
import { InstitutionAiConfig } from "@/components/admin/InstitutionAiConfig";
import { useRequireAuth } from "@/lib/auth";
import { submissionsApi } from "@/lib/api";
import type { SubmissionOut } from "@/lib/api";

type AdminView = "overview" | "schools" | "roles";

export default function AdminPage() {
  const { user, isLoading } = useRequireAuth(["admin", "system_admin"]);
  const [view, setView] = useState<AdminView>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recentSubs, setRecentSubs] = useState<SubmissionOut[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    revision: 0,
    avgScore: 0,
  });

  useEffect(() => {
    if (!user) return;
    submissionsApi.list().then((subs) => {
      setRecentSubs(subs.slice(0, 10));
      const completed = subs.filter((s) => s.status === "completed");
      const approved = completed.filter(
        (s) =>
          s.verdict?.toLowerCase().includes("approved") &&
          !s.verdict?.toLowerCase().includes("major")
      ).length;
      const revision = completed.filter(
        (s) =>
          s.verdict?.toLowerCase().includes("revision") ||
          s.verdict?.toLowerCase().includes("not approved")
      ).length;
      const avg =
        completed.length > 0
          ? Math.round(
              completed.reduce((a, b) => a + (b.overall_score ?? 0), 0) /
                completed.length
            )
          : 0;
      setStats({ total: subs.length, approved, revision, avgScore: avg });
    }).catch(() => {});
  }, [user]);

  if (isLoading || !user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  function verdictTag(status: string, verdict?: string) {
    if (status !== "completed") return <span className="tag tag-blue">Processing</span>;
    if (!verdict) return <span className="tag">—</span>;
    const v = verdict.toLowerCase();
    if (v.includes("approved for use")) return <span className="tag tag-green">Approved</span>;
    if (v.includes("minor")) return <span className="tag tag-amber">Minor Revisions</span>;
    return <span className="tag tag-red">Needs Revision</span>;
  }

  return (
    <AdminLayout onMenuToggle={() => setSidebarOpen((v) => !v)}>
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <nav className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
        <div className="nav-group-label">Admin Console</div>
        <button
          className={`nav-item ${view === "overview" ? "active" : ""}`}
          onClick={() => { setView("overview"); setSidebarOpen(false); }}
        >
          <span className="nav-icon">📊</span> Institution Dashboard
        </button>
        <button
          className={`nav-item ${view === "schools" ? "active" : ""}`}
          onClick={() => { setView("schools"); setSidebarOpen(false); }}
        >
          <span className="nav-icon">🏫</span> Schools &amp; Forms
        </button>
        <button
          className={`nav-item ${view === "roles" ? "active" : ""}`}
          onClick={() => { setView("roles"); setSidebarOpen(false); }}
        >
          <span className="nav-icon">👥</span> User Roles
        </button>
      </nav>
      <main className="main-content">
        {view === "overview" ? (
          <>
            <div className="page-title">Institution Dashboard</div>
            <div className="page-sub">
              Overview of moderation activity for{" "}
              <strong>{user.institution_name ?? "your institution"}</strong>.
            </div>

            <div className="dash-stats">
              <div className="dash-stat">
                <div className="dash-stat-num" style={{ color: "var(--blue2)" }}>
                  {stats.total}
                </div>
                <div className="dash-stat-label">Total Submissions</div>
                <div className="dash-stat-trend">This academic year</div>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-num" style={{ color: "var(--green)" }}>
                  {stats.approved}
                </div>
                <div className="dash-stat-label">Approved</div>
                <div className="dash-stat-trend">Including minor fixes</div>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-num" style={{ color: "var(--amber)" }}>
                  {stats.revision}
                </div>
                <div className="dash-stat-label">Needs Revision</div>
                <div className="dash-stat-trend">Awaiting examiner action</div>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-num" style={{ color: "var(--navy)" }}>
                  {stats.avgScore || "—"}
                </div>
                <div className="dash-stat-label">Avg Moderation Score</div>
                <div className="dash-stat-trend">Across all papers</div>
              </div>
            </div>

            <div className="card">
              <div className="section-hdr">Recent Moderations</div>
              {recentSubs.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px 20px",
                    color: "var(--muted)",
                    fontSize: 13,
                  }}
                >
                  No submissions yet.
                </div>
              ) : (
                <table className="hist-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Course</th>
                      <th>School</th>
                      <th>Examiner</th>
                      <th>Date</th>
                      <th>Score</th>
                      <th>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSubs.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <code style={{ fontSize: 11, color: "var(--muted)" }}>
                            {s.reference}
                          </code>
                        </td>
                        <td>{s.course_name}</td>
                        <td>{s.school_name ?? "—"}</td>
                        <td>{s.user_full_name ?? "—"}</td>
                        <td>{new Date(s.created_at).toLocaleDateString()}</td>
                        <td>
                          {s.overall_score != null ? (
                            <strong>{s.overall_score}/100</strong>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{verdictTag(s.status, s.verdict)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : view === "schools" ? (
          <>
            <div className="page-title">Schools &amp; Moderation Forms</div>
            <div className="page-sub">
              Configure schools and the moderation forms the AI uses for each.
            </div>
            <InstitutionAiConfig />
            <SchoolManager />
          </>
        ) : (
          <>
            <div className="page-title">User &amp; Role Management</div>
            <div className="page-sub">
              Assign examiners, moderators, HODs and admins to their schools.
            </div>
            <RoleManager />
          </>
        )}
      </main>
    </AdminLayout>
  );
}
