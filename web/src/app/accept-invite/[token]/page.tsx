"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { invitationsApi } from "@/lib/api";

type PageState = "loading" | "ready" | "invalid" | "submitting" | "done";

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [state, setState] = useState<PageState>("loading");
  const [institutionName, setInstitutionName] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [invalidMessage, setInvalidMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    invitationsApi
      .get(token)
      .then((info) => {
        setInstitutionName(info.institution_name);
        setEmail(info.email);
        setState("ready");
      })
      .catch((err: unknown) => {
        setInvalidMessage(
          err instanceof Error ? err.message : "This invitation is invalid or has expired."
        );
        setState("invalid");
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setState("submitting");
    try {
      await invitationsApi.accept(token, { full_name: fullName.trim(), password });
      setState("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setState("ready");
    }
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
            You&apos;ve been invited to manage your institution on ExamMind.
            Create your account to get started.
          </p>
          <ul className="login-features">
            <li><span className="login-feature-icon">✓</span> Manage your institution&apos;s users &amp; schools</li>
            <li><span className="login-feature-icon">✓</span> Configure AI moderation settings</li>
            <li><span className="login-feature-icon">✓</span> Monitor all exam submissions</li>
            <li><span className="login-feature-icon">✓</span> Institution-wide oversight &amp; audit trail</li>
          </ul>
        </div>
      </div>

      {/* Right panel */}
      <div className="login-form-panel">
        <div className="login-form-card">

          {state === "loading" && (
            <div style={{ color: "var(--muted)", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
              Validating your invitation…
            </div>
          )}

          {state === "invalid" && (
            <>
              <div className="login-form-header">
                <h2 className="login-form-title">Invitation Invalid</h2>
              </div>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 9,
                  background: "var(--red-lt)",
                  border: "1px solid var(--red-bd)",
                  fontSize: 13,
                  color: "var(--red)",
                  marginBottom: 16,
                }}
              >
                {invalidMessage}
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Contact your platform administrator to request a new invitation link.
              </p>
            </>
          )}

          {(state === "ready" || state === "submitting") && (
            <>
              <div className="login-form-header">
                <h2 className="login-form-title">Create your account</h2>
                <p className="login-form-sub">
                  You&apos;re joining <strong>{institutionName}</strong> as Institution Admin.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="login-form" noValidate>
                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={email}
                    readOnly
                    style={{ background: "var(--bg2, #f8fafc)", cursor: "not-allowed" }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Full name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Dr. Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                {error && <div className="login-error">{error}</div>}

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 8 }}
                  disabled={state === "submitting"}
                >
                  {state === "submitting" ? "Creating account…" : "Create Account"}
                </button>
              </form>
            </>
          )}

          {state === "done" && (
            <>
              <div className="login-form-header">
                <h2 className="login-form-title">Account created!</h2>
                <p className="login-form-sub">
                  Welcome to ExamMind. Sign in with your new credentials to get started.
                </p>
              </div>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 9,
                  background: "var(--green-lt, #f0fdf4)",
                  border: "1px solid var(--green-bd, #bbf7d0)",
                  fontSize: 13,
                  color: "var(--green, #16a34a)",
                  marginBottom: 20,
                }}
              >
                Your account for <strong>{institutionName}</strong> is ready.
              </div>
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={() => router.replace("/login")}
              >
                Go to Sign In
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
