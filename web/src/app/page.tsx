"use client";

// @ts-nocheck

import { useEffect, useRef, useState } from "react";
import { useRequireAuth, useAuth, roleLabel, userInitials } from "@/lib/auth";
import { submissionsApi, schoolsApi, formsApi, aiConfigApi } from "@/lib/api";
import type {
  SubmissionOut,
  SchoolOut,
  ModerationFormOut,
  AiConfigOut,
  ModerationResultData,
  ChatHistoryItem,
} from "@/lib/api";

type View = "new" | "history" | "processing" | "results";

interface ChatMsg { role: "user" | "assistant"; content: string; }

const PROC_STEPS = [
  { icon: "📤", label: "Exam paper uploaded" },
  { icon: "📖", label: "Extracting document text" },
  { icon: "🤖", label: "AI analyzing exam content" },
  { icon: "📊", label: "Generating moderation report" },
];

const SUGGESTED = [
  "What are the main issues with this paper?",
  "Which questions need the most revision?",
  "How can the examiner improve the overall score?",
  "Explain the Bloom's taxonomy distribution.",
];

function scoreColor(n: number) {
  return n >= 75 ? "var(--green)" : n >= 50 ? "var(--amber)" : "var(--red)";
}
function barClass(n: number, max: number) {
  const p = (n / max) * 100;
  return p >= 75 ? "bar-green" : p >= 50 ? "bar-amber" : "bar-red";
}
function bannerClass(verdict: string) {
  const v = verdict.toLowerCase();
  if (v.includes("approved for use")) return "report-banner approved";
  if (v.includes("minor")) return "report-banner revision";
  return "report-banner rejected";
}
function verdictTag(status: string, verdict?: string) {
  if (status === "pending" || status === "processing")
    return <span className="tag tag-blue">Processing…</span>;
  if (status === "failed") return <span className="tag tag-red">Failed</span>;
  if (!verdict) return <span className="tag">—</span>;
  const v = verdict.toLowerCase();
  if (v.includes("approved for use")) return <span className="tag tag-green">Approved</span>;
  if (v.includes("minor")) return <span className="tag tag-amber">Minor Revisions</span>;
  return <span className="tag tag-red">Needs Revision</span>;
}

export default function HomePage() {
  const { user, isLoading } = useRequireAuth([
    "examiner", "moderator", "hod", "admin", "system_admin",
  ]);
  const { logout } = useAuth();

  const [view, setView] = useState<View>("new");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Data
  const [submissions, setSubmissions] = useState<SubmissionOut[]>([]);
  const [schools, setSchools] = useState<SchoolOut[]>([]);
  const [forms, setForms] = useState<ModerationFormOut[]>([]);
  const [instConfig, setInstConfig] = useState<AiConfigOut | null>(null);

  // New submission form
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

  // Processing
  const [activeSubmission, setActiveSubmission] = useState<SubmissionOut | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [procFailed, setProcFailed] = useState(false);
  const pollingRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // Results
  const [result, setResult] = useState<ModerationResultData | null>(null);
  const [resultTab, setResultTab] = useState<"overview" | "detail" | "chat">("overview");

  // Chat
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Edit submission
  const [editingSub, setEditingSub] = useState<SubmissionOut | null>(null);
  const [editFields, setEditFields] = useState({ course_name: "", department: "", level: "", duration: "", total_marks: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete submission
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, chatLoading]);

  // cleanup on unmount
  useEffect(() => () => { clearTimers(); }, []);

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
    } catch { /* ignore */ }
  }

  async function handleSchoolChange(schoolId: string) {
    setSelectedSchool(schoolId);
    setSelectedForm("");
    try { setForms(await formsApi.list(schoolId)); } catch { setForms([]); }
  }

  function clearTimers() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function startProcessing(sub: SubmissionOut) {
    clearTimers();
    setActiveSubmission(sub);
    setElapsed(0);
    setProcFailed(false);
    setResult(null);
    setChatMsgs([]);
    setResultTab("overview");
    setView("processing");

    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    pollingRef.current = setInterval(async () => {
      try {
        const updated = await submissionsApi.get(sub.id);
        setActiveSubmission(updated);
        if (updated.status === "completed") {
          clearTimers();
          // brief pause so user sees all steps lit up
          setTimeout(async () => {
            try {
              const fullResult = await submissionsApi.getResult(updated.id);
              setResult(fullResult);
              setSubmissions((prev) =>
                prev.map((s) => (s.id === updated.id ? updated : s))
              );
              setView("results");
            } catch {
              setProcFailed(true);
            }
          }, 800);
        } else if (updated.status === "failed") {
          clearTimers();
          setProcFailed(true);
        }
      } catch { /* network hiccup — keep polling */ }
    }, 3000);
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
      setExamFile(null);
      setCourseName("");
      setDepartment("");
      setLevel("");
      startProcessing(sub);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function viewResults(sub: SubmissionOut) {
    setActiveSubmission(sub);
    setChatMsgs([]);
    setResultTab("overview");
    try {
      const fullResult = await submissionsApi.getResult(sub.id);
      setResult(fullResult);
      setView("results");
    } catch {
      alert("Could not load result data.");
    }
  }

  function openEdit(s: SubmissionOut) {
    setEditingSub(s);
    setEditFields({ course_name: s.course_name, department: s.department, level: s.level, duration: s.duration, total_marks: s.total_marks });
    setEditError("");
  }

  async function handleEditSave() {
    if (!editingSub) return;
    setEditLoading(true);
    setEditError("");
    try {
      const updated = await submissionsApi.update(editingSub.id, editFields);
      setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSub(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteLoading(true);
    try {
      await submissionsApi.remove(deletingId);
      setSubmissions((prev) => prev.filter((s) => s.id !== deletingId));
      setDeletingId(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function sendChat(msg?: string) {
    const text = (msg ?? chatInput).trim();
    if (!text || !activeSubmission) return;
    setChatInput("");
    const userMsg: ChatMsg = { role: "user", content: text };
    setChatMsgs((prev) => [...prev, userMsg]);
    setChatLoading(true);
    try {
      const history: ChatHistoryItem[] = chatMsgs.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const { answer } = await submissionsApi.chat(activeSubmission.id, text, history);
      setChatMsgs((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (err: unknown) {
      setChatMsgs((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Something went wrong."}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Step state based on elapsed + actual status ───────────────────────────
  function stepState(idx: number): "done" | "active" | "pending" {
    if (activeSubmission?.status === "completed") return "done";
    const thresholds = [0, 3, 6, 18];
    if (elapsed < thresholds[idx]) return "pending";
    // Steps 0-2 complete after their time threshold; step 3 stays active until done
    return idx < 3 ? "done" : "active";
  }

  if (isLoading || !user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
      <div className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">🎓</div>
          <div className="topbar-logo-name">ExamMind</div>
        </div>
        <div className="topbar-sep" />
        <div className="topbar-inst">{user.institution_name ?? "ExamMind"}</div>
        <div className="topbar-right">
          <button className="menu-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle menu">☰</button>
          <div className="topbar-user-pill">
            <div className="topbar-avatar">{initials}</div>
            <div>
              <div className="topbar-uname">{user.full_name}</div>
              <div className="topbar-urole">
                {roleLabel(user.role)}{user.school_name ? ` · ${user.school_name}` : ""}
              </div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="app-body">
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <nav className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
          <div className="nav-group-label">Main</div>
          <button className={`nav-item ${view === "new" ? "active" : ""}`}
            onClick={() => { setView("new"); setSidebarOpen(false); }}>
            <span className="nav-icon">📤</span> New Moderation
          </button>
          <button className={`nav-item ${view === "history" ? "active" : ""}`}
            onClick={() => { setView("history"); setSidebarOpen(false); }}>
            <span className="nav-icon">📋</span> My Submissions
            {submissions.length > 0 && <span className="nav-badge">{submissions.length}</span>}
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

        <div className="main-content">

          {/* ── NEW SUBMISSION ───────────────────────────────────── */}
          {view === "new" && (
            <>
              <div className="page-title">New Exam Moderation</div>
              <div className="page-sub">Upload your exam paper for AI-powered moderation analysis.</div>

              {instConfig ? (
                <div className="api-bar" style={{ marginBottom: 16 }}>
                  <span>✅</span>
                  <span>Institution AI key configured for <strong>{instConfig.provider.toUpperCase()}</strong>.</span>
                </div>
              ) : (
                <div className="api-bar" style={{ marginBottom: 16 }}>
                  <span>⚠️</span>
                  <span>No AI key found. Ask your admin to configure one under <strong>Admin → Schools &amp; Forms → AI Config</strong>.</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="grid-2" style={{ gap: 20, alignItems: "flex-start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div className="card">
                      <div className="card-title">📄 Exam Paper</div>
                      {examFile ? (
                        <div className="file-chip">
                          <span className="file-chip-icon">📄</span>
                          <span className="file-chip-name">{examFile.name}</span>
                          <span className="file-chip-size">{(examFile.size / 1024).toFixed(0)} KB</span>
                          <button type="button" className="file-chip-remove" onClick={() => setExamFile(null)}>✕</button>
                        </div>
                      ) : (
                        <div
                          className={`upload-zone ${dragging ? "drag" : ""}`}
                          style={{ height: 160 }}
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                          onDragLeave={() => setDragging(false)}
                          onDrop={(e) => { e.preventDefault(); setDragging(false); setExamFile(e.dataTransfer.files[0] ?? null); }}
                        >
                          <div className="upload-zone-icon">📁</div>
                          <div className="upload-zone-title">Drop your exam paper here</div>
                          <div className="upload-zone-sub">PDF, DOCX or TXT · drag &amp; drop or click</div>
                          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }}
                            onChange={(e) => setExamFile(e.target.files?.[0] ?? null)} />
                        </div>
                      )}
                    </div>

                    <div className="card">
                      <div className="card-title">📝 Paper Details</div>
                      <div className="grid-2">
                        <div className="form-group">
                          <label className="form-label">Course Name *</label>
                          <input className="form-input" value={courseName} onChange={(e) => setCourseName(e.target.value)}
                            placeholder="e.g. BSN 301 – Medical Nursing" required />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Department</label>
                          <input className="form-input" value={department} onChange={(e) => setDepartment(e.target.value)}
                            placeholder="e.g. School of Nursing" />
                        </div>
                      </div>
                      <div className="grid-2">
                        <div className="form-group">
                          <label className="form-label">Level / Year</label>
                          <input className="form-input" value={level} onChange={(e) => setLevel(e.target.value)}
                            placeholder="e.g. Year 3" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Duration</label>
                          <input className="form-input" value={duration} onChange={(e) => setDuration(e.target.value)}
                            placeholder="e.g. 3 Hours" />
                        </div>
                      </div>
                      <div className="grid-2">
                        <div className="form-group">
                          <label className="form-label">Total Marks</label>
                          <input className="form-input" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)}
                            placeholder="100" />
                        </div>
                        {schools.length > 0 && (
                          <div className="form-group">
                            <label className="form-label">School</label>
                            <select className="form-select" value={selectedSchool}
                              onChange={(e) => handleSchoolChange(e.target.value)}>
                              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      {forms.length > 0 && (
                        <div className="form-group">
                          <label className="form-label">Moderation Form (optional)</label>
                          <select className="form-select" value={selectedForm}
                            onChange={(e) => setSelectedForm(e.target.value)}>
                            <option value="">Use default criteria</option>
                            {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title">✅ What gets checked</div>
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {["Bloom's Taxonomy Coverage", "Mark Allocation", "Learning Outcomes Alignment",
                        "Cognitive Level Distribution", "Question Clarity & Language", "Difficulty Balance",
                      ].map((item) => (
                        <li key={item} style={{ padding: "10px 12px", borderRadius: 10,
                          background: "var(--green-lt)", border: "1px solid var(--green-bd)",
                          fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>✓</span><span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    {submitError && (
                      <div style={{ padding: "10px 14px", borderRadius: 9, background: "var(--red-lt)",
                        border: "1px solid var(--red-bd)", fontSize: 12, color: "var(--red)", marginBottom: 12 }}>
                        {submitError}
                      </div>
                    )}
                    <button type="submit" className="btn btn-primary btn-full"
                      disabled={!examFile || !courseName || submitting}>
                      {submitting ? "Submitting…" : "🚀 Run AI Moderation"}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}

          {/* ── HISTORY ──────────────────────────────────────────── */}
          {view === "history" && (
            <>
              <div className="page-title">Submission History</div>
              <div className="page-sub">All exam papers submitted for AI moderation.</div>
              <div className="card">
                {submissions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", fontSize: 13 }}>
                    No submissions yet.{" "}
                    <button className="btn btn-ghost btn-sm" onClick={() => setView("new")}>
                      Submit your first exam →
                    </button>
                  </div>
                ) : (
                  <table className="hist-table">
                    <thead>
                      <tr>
                        <th>Reference</th><th>Course</th><th>Department</th>
                        <th>Date</th><th>Score</th><th>Verdict</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((s) => (
                        <tr key={s.id}>
                          <td><code style={{ fontSize: 11, color: "var(--muted)" }}>{s.reference}</code></td>
                          <td>{s.course_name}</td>
                          <td>{s.department || "—"}</td>
                          <td>{new Date(s.created_at).toLocaleDateString()}</td>
                          <td>{s.overall_score != null ? <strong>{s.overall_score}/100</strong> : "—"}</td>
                          <td>{verdictTag(s.status, s.verdict)}</td>
                          <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {s.status === "completed" && (
                              <button className="btn btn-outline btn-sm" onClick={() => viewResults(s)}>
                                View →
                              </button>
                            )}
                            {s.status === "completed" && s.report_filename && (
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => submissionsApi.downloadReport(s.id, `Moderation_Report_${s.reference}.pdf`).catch((e) => alert(e.message))}>
                                PDF
                              </button>
                            )}
                            {(s.status === "pending" || s.status === "processing") && (
                              <button className="btn btn-outline btn-sm" onClick={() => startProcessing(s)}>
                                Track →
                              </button>
                            )}
                            {user.role === "examiner" && s.status !== "processing" && (
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}
                                style={{ color: "var(--blue2)" }}>
                                Edit
                              </button>
                            )}
                            {user.role === "examiner" && s.status !== "processing" && (
                              <button className="btn btn-ghost btn-sm" onClick={() => setDeletingId(s.id)}
                                style={{ color: "var(--red)" }}>
                                Delete
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

          {/* ── PROCESSING ───────────────────────────────────────── */}
          {view === "processing" && activeSubmission && (
            <div className="proc-wrap">
              <div className="proc-card">
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>
                    <code>{activeSubmission.reference}</code>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>
                    {activeSubmission.course_name}
                  </div>
                  {!procFailed && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                      AI moderation usually takes 15–30 seconds…
                    </div>
                  )}
                </div>

                {procFailed ? (
                  <div style={{ textAlign: "center", padding: 20 }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--red)", marginBottom: 8 }}>
                      Moderation failed
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
                      Check that your institution's AI key is valid and the paper is a readable DOCX or PDF.
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setView("history")}>View History</button>
                      <button className="btn btn-primary btn-sm" onClick={() => setView("new")}>Try Again</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="proc-steps">
                      {PROC_STEPS.map((step, i) => {
                        const state = stepState(i);
                        return (
                          <div key={i} className={`proc-step${state === "done" ? " s-done" : state === "active" ? " s-active" : ""}`}>
                            <div style={{ fontSize: 20, marginRight: 12 }}>
                              {state === "done" ? "✅" : state === "active" ? (
                                <span style={{ display: "inline-block", animation: "spin 0.7s linear infinite" }}>⏳</span>
                              ) : "⬜"}
                            </div>
                            <div>
                              <div style={{ fontWeight: state === "active" ? 600 : 400,
                                color: state === "done" ? "var(--green)" : state === "active" ? "var(--blue)" : "var(--muted)",
                                fontSize: 14 }}>
                                {step.label}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="proc-bar-wrap" style={{ marginTop: 20 }}>
                      <div className="proc-bar" style={{
                        width: `${Math.min(95, (elapsed / 22) * 100)}%`,
                        transition: "width 1s linear",
                      }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {elapsed}s elapsed
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── RESULTS ──────────────────────────────────────────── */}
          {view === "results" && activeSubmission && result && (
            <>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                <div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setView("history")}
                    style={{ marginBottom: 6 }}>← Back</button>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    <code>{activeSubmission.reference}</code> · {new Date(activeSubmission.created_at).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)", marginTop: 2 }}>
                    {activeSubmission.course_name}
                  </div>
                </div>
                <button className="btn btn-primary btn-sm"
                  onClick={() => submissionsApi.downloadReport(
                    activeSubmission.id,
                    `Moderation_Report_${activeSubmission.reference}.pdf`
                  ).catch((e) => alert(e.message))}>
                  ⬇ Download Report PDF
                </button>
              </div>

              {/* Verdict banner */}
              <div className={bannerClass(result.verdict)} style={{ marginBottom: 20 }}>
                <div className="rb-score-circle" style={{ color: scoreColor(result.overall_score) }}>
                  <span style={{ fontSize: 36, fontWeight: 800 }}>{result.overall_score}</span>
                  <span style={{ fontSize: 14, opacity: 0.7 }}>/100</span>
                </div>
                <div>
                  <div className="rb-verdict">{result.verdict}</div>
                  <div className="rb-course">{result.verdict_justification}</div>
                  <div className="rb-meta-row" style={{ marginTop: 8 }}>
                    <div className="rb-meta-item">
                      <span>Questions</span><strong>{result.question_count ?? "—"}</strong>
                    </div>
                    <div className="rb-meta-item">
                      <span>Sections</span><strong>{result.section_count ?? "—"}</strong>
                    </div>
                    <div className="rb-meta-item">
                      <span>Total Marks</span><strong>{activeSubmission.total_marks}</strong>
                    </div>
                    <div className="rb-meta-item">
                      <span>Duration</span><strong>{activeSubmission.duration}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab bar */}
              <div className="steps-bar" style={{ marginBottom: 20 }}>
                {(["overview", "detail", "chat"] as const).map((t) => (
                  <button key={t} className={`step-tab${resultTab === t ? " active" : ""}`}
                    onClick={() => setResultTab(t)}>
                    {t === "overview" ? "📋 Overview" : t === "detail" ? "🔬 Detailed Analysis" : "💬 Ask AI"}
                  </button>
                ))}
              </div>

              {/* ── OVERVIEW TAB ── */}
              {resultTab === "overview" && (
                <div className="grid-2" style={{ gap: 20, alignItems: "flex-start" }}>
                  {/* Left: criteria + findings */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Criteria scores */}
                    {result.criteria_scores?.length > 0 && (
                      <div className="card">
                        <div className="card-title">Criteria Scores</div>
                        {result.criteria_scores.map((c) => (
                          <div key={c.criterion} style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between",
                              alignItems: "baseline", marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{c.criterion}</span>
                              <span style={{ fontSize: 13, fontWeight: 700,
                                color: scoreColor(c.score / c.max_score * 100) }}>
                                {c.score}/{c.max_score}
                              </span>
                            </div>
                            <div className="sc-bar-wrap">
                              <div className={`sc-bar-fill ${barClass(c.score, c.max_score)}`}
                                style={{ width: `${(c.score / c.max_score) * 100}%` }} />
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{c.comment}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Findings */}
                    <div className="card">
                      <div className="card-title">Findings</div>
                      {result.strengths?.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--green)",
                            marginBottom: 6, marginTop: 4 }}>✓ STRENGTHS</div>
                          {result.strengths.map((s, i) => (
                            <div key={i} className="finding-row pos">• {s}</div>
                          ))}
                        </>
                      )}
                      {result.weaknesses?.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--amber)",
                            marginBottom: 6, marginTop: 12 }}>⚠ AREAS FOR IMPROVEMENT</div>
                          {result.weaknesses.map((w, i) => (
                            <div key={i} className="finding-row warn">• {w}</div>
                          ))}
                        </>
                      )}
                      {result.critical_issues?.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)",
                            marginBottom: 6, marginTop: 12 }}>⛔ CRITICAL ISSUES</div>
                          {result.critical_issues.map((c, i) => (
                            <div key={i} className="finding-row err">• {c}</div>
                          ))}
                        </>
                      )}
                      {!result.critical_issues?.length && (
                        <div className="finding-row info" style={{ marginTop: 8 }}>
                          ✓ No critical issues found
                        </div>
                      )}
                    </div>

                    {/* Moderator remarks */}
                    {result.moderator_remarks && (
                      <div className="card">
                        <div className="card-title">Moderator's Remarks</div>
                        <div className="remarks-wrap">
                          {Object.values(result.moderator_remarks).filter(Boolean).map((p, i) => (
                            <div key={i} className="remark-para">{p as string}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Required actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {result.required_actions?.length > 0 && (
                      <div className="card">
                        <div className="card-title">Required Actions</div>
                        {result.required_actions.map((a, i) => {
                          const color = a.priority === "High" ? "var(--red)"
                            : a.priority === "Medium" ? "var(--amber)" : "var(--green)";
                          return (
                            <div key={i} style={{ padding: "10px 12px", borderRadius: 8,
                              background: "var(--bg)", border: "1px solid var(--border)",
                              marginBottom: 8 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color,
                                  background: color + "18", padding: "2px 7px", borderRadius: 10 }}>
                                  {a.priority}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--muted)" }}>{a.deadline}</span>
                              </div>
                              <div style={{ fontSize: 13 }}>{a.action}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Moderation checklist preview */}
                    {result.moderation_checklist?.length > 0 && (
                      <div className="card">
                        <div className="card-title">Checklist Summary</div>
                        {result.moderation_checklist.slice(0, 6).map((item, i) => {
                          const cls = item.status === "Pass" ? "status-yes"
                            : item.status === "Fail" ? "status-no" : "status-partial";
                          return (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between",
                              alignItems: "flex-start", padding: "6px 0",
                              borderBottom: "1px solid var(--border)", gap: 12 }}>
                              <span style={{ fontSize: 12, flex: 1 }}>{item.item}</span>
                              <span className={cls} style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                                {item.status}
                              </span>
                            </div>
                          );
                        })}
                        {result.moderation_checklist.length > 6 && (
                          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                            onClick={() => setResultTab("detail")}>
                            View all {result.moderation_checklist.length} items →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── DETAIL TAB ── */}
              {resultTab === "detail" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* Bloom's */}
                  {result.blooms_distribution?.length > 0 && (
                    <div className="card">
                      <div className="card-title">Bloom's Taxonomy Distribution</div>
                      <table className="bloom-table">
                        <thead>
                          <tr>
                            <th>Cognitive Level</th><th>Questions</th>
                            <th>Marks</th><th>% of Paper</th><th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.blooms_distribution.map((b) => (
                            <tr key={b.level}>
                              <td><strong>{b.level}</strong></td>
                              <td>{b.count}</td>
                              <td>{b.marks}</td>
                              <td>{b.percentage?.toFixed(1)}%</td>
                              <td>
                                <span className={b.adequate ? "status-yes" : "status-partial"}>
                                  {b.adequate ? "Adequate" : "Review"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Question analysis */}
                  {result.question_analysis?.length > 0 && (
                    <div className="card">
                      <div className="card-title">Question-by-Question Analysis</div>
                      <table className="q-table">
                        <thead>
                          <tr>
                            <th>Ref</th><th>Marks</th><th>Bloom's</th><th>Clarity</th><th>Comment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.question_analysis.map((q, i) => (
                            <tr key={i}>
                              <td><strong>{q.reference}</strong></td>
                              <td>{q.marks}</td>
                              <td>{q.bloom_level}</td>
                              <td>
                                <span className={
                                  q.clarity_rating === "Clear" ? "status-yes"
                                  : q.clarity_rating === "Unclear" ? "status-no" : "status-partial"
                                }>{q.clarity_rating}</span>
                              </td>
                              <td style={{ fontSize: 12, color: "var(--muted)" }}>{q.comment}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Full checklist */}
                  {result.moderation_checklist?.length > 0 && (
                    <div className="card">
                      <div className="card-title">Full Moderation Checklist</div>
                      <table className="checklist-table">
                        <thead>
                          <tr><th>Item</th><th>Status</th><th>Note</th></tr>
                        </thead>
                        <tbody>
                          {result.moderation_checklist.map((item, i) => (
                            <tr key={i}>
                              <td>{item.item}</td>
                              <td>
                                <span className={
                                  item.status === "Pass" ? "status-yes"
                                  : item.status === "Fail" ? "status-no" : "status-partial"
                                }>{item.status}</span>
                              </td>
                              <td style={{ fontSize: 12, color: "var(--muted)" }}>{item.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── CHAT TAB ── */}
              {resultTab === "chat" && (
                <div className="grid-2" style={{ gap: 20, alignItems: "flex-start" }}>
                  <div className="card" style={{ display: "flex", flexDirection: "column", height: 520 }}>
                    <div className="card-title" style={{ marginBottom: 12 }}>
                      💬 Ask about this moderation
                    </div>

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: "auto", display: "flex",
                      flexDirection: "column", gap: 10, marginBottom: 12 }}>
                      {chatMsgs.length === 0 && (
                        <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center",
                          padding: "20px 0" }}>
                          Ask anything about the moderation results below.
                        </div>
                      )}
                      {chatMsgs.map((m, i) => (
                        <div key={i} style={{
                          display: "flex",
                          justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                        }}>
                          <div style={{
                            maxWidth: "82%", padding: "9px 13px", borderRadius:
                              m.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                            background: m.role === "user" ? "var(--blue)" : "var(--bg)",
                            border: m.role === "user" ? "none" : "1px solid var(--border)",
                            color: m.role === "user" ? "#fff" : "var(--ink)",
                            fontSize: 13, lineHeight: 1.55,
                            animation: "fadeUp 0.2s ease",
                          }}>
                            {m.content}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div style={{ display: "flex" }}>
                          <div style={{ padding: "9px 14px", borderRadius: "14px 14px 14px 2px",
                            background: "var(--bg)", border: "1px solid var(--border)",
                            display: "flex", gap: 5, alignItems: "center" }}>
                            {[0, 1, 2].map((d) => (
                              <span key={d} style={{
                                width: 7, height: 7, borderRadius: "50%",
                                background: "var(--muted)", display: "inline-block",
                                animation: `fadeUp 0.9s ease ${d * 0.2}s infinite alternate`,
                              }} />
                            ))}
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="form-input" style={{ flex: 1, fontSize: 13 }}
                        placeholder="Ask a question about this moderation…"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                        disabled={chatLoading} />
                      <button className="btn btn-primary btn-sm" onClick={() => sendChat()}
                        disabled={chatLoading || !chatInput.trim()}>
                        Send
                      </button>
                    </div>
                  </div>

                  {/* Suggested questions */}
                  <div className="card">
                    <div className="card-title">Suggested Questions</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {SUGGESTED.map((q) => (
                        <button key={q} className="btn btn-outline btn-sm"
                          style={{ textAlign: "left", whiteSpace: "normal", height: "auto",
                            padding: "10px 14px", lineHeight: 1.4 }}
                          onClick={() => { setResultTab("chat"); sendChat(q); }}
                          disabled={chatLoading}>
                          {q}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 8,
                      background: "var(--blue-lt)", border: "1px solid var(--blue-md)",
                      fontSize: 12, color: "var(--blue2)" }}>
                      The AI has full access to the moderation report and can explain any score,
                      suggest specific improvements, or compare against standard criteria.
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom download */}
              <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
                <button className="btn btn-primary"
                  style={{ padding: "12px 32px", fontSize: 15 }}
                  onClick={() => submissionsApi.downloadReport(
                    activeSubmission.id,
                    `Moderation_Report_${activeSubmission.reference}.pdf`
                  ).catch((e) => alert(e.message))}>
                  ⬇ Download Full Moderation Report PDF
                </button>
              </div>
            </>
          )}

        </div>
      </div>

      {/* ── Edit Submission Modal ─────────────────────────────────── */}
      {editingSub && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 480, margin: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>Edit Submission</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
              <code>{editingSub.reference}</code>
            </div>

            {editError && (
              <div style={{ background: "var(--red-lt, #fff1f1)", border: "1px solid var(--red)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "var(--red)", marginBottom: 14 }}>
                {editError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)", display: "block", marginBottom: 4 }}>Course Name *</label>
                <input className="form-input" value={editFields.course_name}
                  onChange={(e) => setEditFields((f) => ({ ...f, course_name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)", display: "block", marginBottom: 4 }}>Department</label>
                <input className="form-input" value={editFields.department}
                  onChange={(e) => setEditFields((f) => ({ ...f, department: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)", display: "block", marginBottom: 4 }}>Level / Year</label>
                <input className="form-input" value={editFields.level}
                  onChange={(e) => setEditFields((f) => ({ ...f, level: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)", display: "block", marginBottom: 4 }}>Duration</label>
                  <input className="form-input" value={editFields.duration}
                    onChange={(e) => setEditFields((f) => ({ ...f, duration: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)", display: "block", marginBottom: 4 }}>Total Marks</label>
                  <input className="form-input" value={editFields.total_marks}
                    onChange={(e) => setEditFields((f) => ({ ...f, total_marks: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingSub(null)} disabled={editLoading}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleEditSave} disabled={editLoading || !editFields.course_name.trim()}>
                {editLoading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────────────── */}
      {deletingId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 380, margin: 0, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", marginBottom: 8 }}>Delete Submission?</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24 }}>
              This will permanently remove the submission, uploaded exam file, and any generated report. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeletingId(null)} disabled={deleteLoading}>
                Cancel
              </button>
              <button className="btn btn-sm" onClick={handleDelete} disabled={deleteLoading}
                style={{ background: "var(--red)", color: "#fff", border: "none" }}>
                {deleteLoading ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
