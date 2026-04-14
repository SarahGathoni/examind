"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If already logged in, redirect to appropriate dashboard
  useEffect(() => {
    if (isLoading || !user) return;
    if (user.role === "system_admin") router.replace("/system-admin");
    else if (user.role === "admin") router.replace("/admin");
    else router.replace("/");
  }, [user, isLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Invalid email or password."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--navy)",
        }}
      >
        <div style={{ color: "#fff", fontSize: 15 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      {/* Left branding panel */}
      <div className="login-brand">
        <div className="login-brand-inner">
          <div className="login-logo">
            <span className="login-logo-icon">🎓</span>
            <span className="login-logo-name">ExamMind</span>
          </div>
          <h1 className="login-tagline">
            AI-Powered Exam&nbsp;Moderation for Institutions
          </h1>
          <p className="login-desc">
            One platform for examiners, moderators, heads of department and
            institution admins — all working together to deliver quality
            assessments.
          </p>
          <ul className="login-features">
            <li>
              <span className="login-feature-icon">✓</span> Automated Bloom's
              Taxonomy analysis
            </li>
            <li>
              <span className="login-feature-icon">✓</span> Instant moderation
              scores &amp; PDF reports
            </li>
            <li>
              <span className="login-feature-icon">✓</span> Role-based access
              for every stakeholder
            </li>
            <li>
              <span className="login-feature-icon">✓</span> Institution-wide
              oversight &amp; audit trail
            </li>
          </ul>
        </div>
      </div>

      {/* Right login form */}
      <div className="login-form-panel">
        <div className="login-form-card">
          <div className="login-form-header">
            <h2 className="login-form-title">Sign in to ExamMind</h2>
            <p className="login-form-sub">
              Use the credentials provided by your institution admin.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="you@university.ac.ke"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 8 }}
              disabled={submitting || !email || !password}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="login-roles-info">
            <div className="login-roles-title">Access levels</div>
            <div className="login-roles-grid">
              {[
                { role: "Examiner", desc: "Submit & track exam papers" },
                { role: "Moderator", desc: "Review moderation results" },
                { role: "HOD", desc: "Department-level oversight" },
                { role: "Admin", desc: "Manage institution settings" },
              ].map(({ role, desc }) => (
                <div key={role} className="login-role-chip">
                  <strong>{role}</strong>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
