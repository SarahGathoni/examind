"use client";

// @ts-nocheck

import { useEffect, useRef, useState } from "react";
import { useRequireAuth, useAuth, roleLabel, userInitials } from "@/lib/auth";
import { submissionsApi, schoolsApi, formsApi, aiConfigApi } from "@/lib/api";
import type { SubmissionOut, SchoolOut, ModerationFormOut, AiConfigOut } from "@/lib/api";

type View = "new" | "history";

export default function HomePage() {
  const { user, isLoading } = useRequireAuth([
    "examiner",
    "moderator",
    "hod",
    "admin",
    "system_admin",
  ]);

  const [view, setView] = useState<View>("new");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionOut[]>([]);
  const [schools, setSchools] = useState<SchoolOut[]>([]);
  const [forms, setForms] = useState<ModerationFormOut[]>([]);
  const [instConfig, setInstConfig] = useState<AiConfigOut | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [duration, setDuration] = useState("3 Hours");
  const [totalMarks, setTotalMarks] = useState("100");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedForm, setSelectedForm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { logout } = useAuth();

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    try {
      const [subs, schoolList, aiCfg] = await Promise.all([
        submissionsApi.list(),
        schoolsApi.list(),
        aiConfigApi.status(),
      ]);
      setSubmissions(subs);
      setSchools(schoolList);
      setInstConfig(aiCfg);
      if (schoolList.length > 0) {
        setSelectedSchool(schoolList[0].id);
        const fms = await formsApi.list(schoolList[0].id);
        setForms(fms);
      }
    } catch {
      // silently ignore load errors — user might not have schools yet
    }
  }

  async function handleSchoolChange(schoolId: string) {
    setSelectedSchool(schoolId);
    setSelectedForm("");
    try {
      const fms = await formsApi.list(schoolId);
      setForms(fms);
    } catch {
      setForms([]);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setExamFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!examFile) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      const sub = await submissionsApi.create(examFile, {
        course_name: courseName,
        department,
        level,
        duration,
        total_marks: totalMarks,
        school_id: selectedSchool || undefined,
        form_id: selectedForm || undefined,
      });
      setSubmissions((prev) => [sub, ...prev]);
      // Reset form
      setExamFile(null);
      setCourseName("");
      setDepartment("");
      setLevel("");
      setView("history");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function verdictTag(status: string, verdict?: string) {
    if (status === "pending" || status === "processing")
      return <span className="tag tag-blue">Processing…</span>;
    if (status === "failed")
      return <span className="tag tag-red">Failed</span>;
    if (!verdict) return <span className="tag">—</span>;
    const v = verdict.toLowerCase();
    if (v.includes("approved for use"))
      return <span className="tag tag-green">Approved</span>;
    if (v.includes("minor"))
      return <span className="tag tag-amber">Minor Revisions</span>;
    return <span className="tag tag-red">Needs Revision</span>;
  }

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

  const initials = userInitials(user.full_name);
  const pendingCount = submissions.filter(
    (s) => s.status === "pending" || s.status === "processing"
  ).length;

  return (
    <div id="appScreen">
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">🎓</div>
          <div className="topbar-logo-name">ExamMind</div>
        </div>
        <div className="topbar-sep" />
        <div className="topbar-inst">{user.institution_name ?? "ExamMind"}</div>
        <div className="topbar-right">
          <button
            className="menu-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <div className="topbar-user-pill">
            <div className="topbar-avatar">{initials}</div>
            <div>
              <div className="topbar-uname">{user.full_name}</div>
              <div className="topbar-urole">
                {roleLabel(user.role)}
                {user.school_name ? ` · ${user.school_name}` : ""}
              </div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      <div className="app-body">
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar */}
        <nav className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
          <div className="nav-group-label">Main</div>
          <button
            className={`nav-item ${view === "new" ? "active" : ""}`}
            onClick={() => { setView("new"); setSidebarOpen(false); }}
          >
            <span className="nav-icon">📤</span> New Moderation
          </button>
          <button
            className={`nav-item ${view === "history" ? "active" : ""}`}
            onClick={() => { setView("history"); setSidebarOpen(false); }}
          >
            <span className="nav-icon">📋</span> My Submissions
            {submissions.length > 0 && (
              <span className="nav-badge">{submissions.length}</span>
            )}
          </button>
          {pendingCount > 0 && (
            <>
              <div className="nav-group-label">Status</div>
              <button className="nav-item" onClick={() => { setView("history"); setSidebarOpen(false); }}>
                <span className="nav-icon">⏳</span> Processing
                <span className="nav-badge red">{pendingCount}</span>
              </button>
            </>
          )}
          <div className="sidebar-bottom">
            {user.school_name && (
              <div className="dept-badge">
                <div className="dept-badge-icon">🏫</div>
                <span>{user.school_name}</span>
              </div>
            )}
          </div>
        </nav>

        {/* Main content */}
        <div className="main-content">
          {view === "new" ? (
            <>
              <div className="page-title">New Exam Moderation</div>
              <div className="page-sub">
                Upload your exam paper for AI-powered moderation analysis.
              </div>

              {/* Institution AI key info */}
              {instConfig ? (
                <div className="api-bar" style={{ marginBottom: 16 }}>
                  <span>✅</span>
                  <span>
                    Institution-level AI key configured for{" "}
                    <strong>{instConfig.provider.toUpperCase()}</strong>. Your
                    submissions will use this automatically.
                  </span>
                </div>
              ) : (
                <div className="api-bar" style={{ marginBottom: 16 }}>
                  <span>⚠️</span>
                  <span>
                    No institution AI key found. Ask your admin to configure an
                    API key under{" "}
                    <strong>Admin → Schools &amp; Forms → AI Config</strong>.
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="grid-2" style={{ gap: 20, alignItems: "flex-start" }}>
                  {/* Left: upload + meta */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div className="card">
                      <div className="card-title">📄 Exam Paper</div>
                      {examFile ? (
                        <div className="file-chip">
                          <span className="file-chip-icon">📄</span>
                          <span className="file-chip-name">{examFile.name}</span>
                          <span className="file-chip-size">
                            {(examFile.size / 1024).toFixed(0)} KB
                          </span>
                          <button
                            type="button"
                            className="file-chip-remove"
                            onClick={() => setExamFile(null)}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div
                          className={`upload-zone ${dragging ? "drag" : ""}`}
                          style={{ height: 180 }}
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragging(true);
                          }}
                          onDragLeave={() => setDragging(false)}
                          onDrop={handleFileDrop}
                        >
                          <div className="upload-zone-icon">📁</div>
                          <div className="upload-zone-title">
                            Drop your exam paper here
                          </div>
                          <div className="upload-zone-sub">
                            PDF, DOCX, or TXT · drag &amp; drop or click to browse
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.docx,.doc,.txt"
                            style={{ display: "none" }}
                            onChange={(e) =>
                              setExamFile(e.target.files?.[0] ?? null)
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div className="card">
                      <div className="card-title">📝 Paper Details</div>
                      <div className="grid-2">
                        <div className="form-group">
                          <label className="form-label">Course Name *</label>
                          <input
                            className="form-input"
                            value={courseName}
                            onChange={(e) => setCourseName(e.target.value)}
                            placeholder="e.g. CSC 204 – Data Structures"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Department</label>
                          <input
                            className="form-input"
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            placeholder="e.g. Computer Science"
                          />
                        </div>
                      </div>
                      <div className="grid-2">
                        <div className="form-group">
                          <label className="form-label">Level / Year</label>
                          <input
                            className="form-input"
                            value={level}
                            onChange={(e) => setLevel(e.target.value)}
                            placeholder="e.g. Year 2 / Level 200"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Duration</label>
                          <input
                            className="form-input"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            placeholder="e.g. 3 Hours"
                          />
                        </div>
                      </div>
                      <div className="grid-2">
                        <div className="form-group">
                          <label className="form-label">Total Marks</label>
                          <input
                            className="form-input"
                            value={totalMarks}
                            onChange={(e) => setTotalMarks(e.target.value)}
                            placeholder="100"
                          />
                        </div>
                        {schools.length > 0 && (
                          <div className="form-group">
                            <label className="form-label">School</label>
                            <select
                              className="form-select"
                              value={selectedSchool}
                              onChange={(e) =>
                                handleSchoolChange(e.target.value)
                              }
                            >
                              {schools.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                      {forms.length > 0 && (
                        <div className="form-group">
                          <label className="form-label">
                            Moderation Form (optional)
                          </label>
                          <select
                            className="form-select"
                            value={selectedForm}
                            onChange={(e) => setSelectedForm(e.target.value)}
                          >
                            <option value="">Use default criteria</option>
                            {forms.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: criteria + submit */}
                  <div className="card">
                    <div className="card-title">✅ Moderation Criteria</div>
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        marginBottom: 20,
                      }}
                    >
                      {[
                        "Bloom's Taxonomy Coverage",
                        "Mark Allocation",
                        "Learning Outcomes Alignment",
                        "Cognitive Level Distribution",
                        "Question Clarity & Language",
                        "Difficulty Balance",
                      ].map((item) => (
                        <li
                          key={item}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: "var(--green-lt)",
                            border: "1px solid var(--green-bd)",
                            fontSize: 13,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 16 }}>✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>

                    {submitError && (
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
                        {submitError}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="btn btn-primary btn-full"
                      disabled={!examFile || !courseName || submitting}
                    >
                      {submitting
                        ? "Submitting…"
                        : "🚀 Run AI Moderation"}
                    </button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="page-title">Submission History</div>
              <div className="page-sub">
                All exam papers submitted for AI moderation.
              </div>
              <div className="card">
                {submissions.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "40px 20px",
                      color: "var(--muted)",
                      fontSize: 13,
                    }}
                  >
                    No submissions yet.{" "}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setView("new")}
                    >
                      Submit your first exam →
                    </button>
                  </div>
                ) : (
                  <table className="hist-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Course</th>
                        <th>Department</th>
                        <th>Date</th>
                        <th>Score</th>
                        <th>Verdict</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <code
                              style={{ fontSize: 11, color: "var(--muted)" }}
                            >
                              {s.reference}
                            </code>
                          </td>
                          <td>{s.course_name}</td>
                          <td>{s.department || "—"}</td>
                          <td>
                            {new Date(s.created_at).toLocaleDateString()}
                          </td>
                          <td>
                            {s.overall_score != null ? (
                              <strong>{s.overall_score}/100</strong>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{verdictTag(s.status, s.verdict)}</td>
                          <td>
                            {s.status === "completed" &&
                              s.report_filename && (
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() =>
                                    submissionsApi
                                      .downloadReport(s.id, `Moderation_Report_${s.reference}.pdf`)
                                      .catch((e) => alert(e.message))
                                  }
                                >
                                  Report →
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
