"use client";

import React, { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { InstitutionManager } from "@/components/system/InstitutionManager";
import { useRequireAuth } from "@/lib/auth";
import { statsApi } from "@/lib/api";
import type { PlatformStats } from "@/lib/api";

type SysView = "overview" | "institutions";

export default function SystemAdminPage() {
  const { user, isLoading } = useRequireAuth(["system_admin"]);
  const [view, setView] = useState<SysView>("overview");
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    if (!user) return;
    statsApi.platform().catch(() => null).then((s) => s && setStats(s));
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

  return (
    <AdminLayout>
      <nav className="sidebar">
        <div className="nav-group-label">System Admin</div>
        <button
          className={`nav-item ${view === "overview" ? "active" : ""}`}
          onClick={() => setView("overview")}
        >
          <span className="nav-icon">📊</span> Platform Overview
        </button>
        <button
          className={`nav-item ${view === "institutions" ? "active" : ""}`}
          onClick={() => setView("institutions")}
        >
          <span className="nav-icon">🌍</span> Institutions
        </button>
      </nav>
      <main className="main-content">
        {view === "overview" ? (
          <>
            <div className="page-title">Platform Overview</div>
            <div className="page-sub">
              High-level metrics across all institutions on ExamMind.
            </div>
            <div className="dash-stats">
              <div className="dash-stat">
                <div
                  className="dash-stat-num"
                  style={{ color: "var(--blue2)" }}
                >
                  {stats?.total_institutions ?? "—"}
                </div>
                <div className="dash-stat-label">Institutions</div>
                <div className="dash-stat-trend">Onboarded</div>
              </div>
              <div className="dash-stat">
                <div
                  className="dash-stat-num"
                  style={{ color: "var(--green)" }}
                >
                  {stats?.total_submissions ?? "—"}
                </div>
                <div className="dash-stat-label">Total Papers</div>
                <div className="dash-stat-trend">All time</div>
              </div>
              <div className="dash-stat">
                <div
                  className="dash-stat-num"
                  style={{ color: "var(--amber)" }}
                >
                  {stats?.needs_revision_count ?? "—"}
                </div>
                <div className="dash-stat-label">Needs Revision</div>
                <div className="dash-stat-trend">Pending follow-up</div>
              </div>
              <div className="dash-stat">
                <div
                  className="dash-stat-num"
                  style={{ color: "var(--navy)" }}
                >
                  {stats?.avg_score ? `${stats.avg_score}` : "—"}
                </div>
                <div className="dash-stat-label">Avg Score</div>
                <div className="dash-stat-trend">Across institutions</div>
              </div>
            </div>
            <div className="dash-stats">
              <div className="dash-stat">
                <div
                  className="dash-stat-num"
                  style={{ color: "var(--green)" }}
                >
                  {stats?.approved_count ?? "—"}
                </div>
                <div className="dash-stat-label">Approved</div>
                <div className="dash-stat-trend">Passed moderation</div>
              </div>
              <div className="dash-stat">
                <div
                  className="dash-stat-num"
                  style={{ color: "var(--navy)" }}
                >
                  {stats?.total_users ?? "—"}
                </div>
                <div className="dash-stat-label">Total Users</div>
                <div className="dash-stat-trend">All roles</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="page-title">Institutions</div>
            <div className="page-sub">
              Manage universities that use ExamMind and assign institution
              admins.
            </div>
            <InstitutionManager />
          </>
        )}
      </main>
    </AdminLayout>
  );
}
