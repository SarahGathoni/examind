"use client";

import React, { useEffect, useState } from "react";
import { aiConfigApi } from "@/lib/api";

type Provider = "anthropic" | "gemini" | "openai";

export function InstitutionAiConfig() {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    aiConfigApi
      .get()
      .then((cfg) => {
        if (cfg) {
          setProvider(cfg.provider as Provider);
          setConfigured(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await aiConfigApi.save({ provider, api_key: apiKey.trim() });
      setConfigured(true);
      setApiKey("");
      setSuccess(
        `${provider.toUpperCase()} key saved. All submissions in this institution will use it.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">
        🔑 Institution AI Configuration
        <span className="card-sub">
          API key used by all examiners &amp; moderators in this institution
        </span>
      </div>
      {error && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--red-lt)",
            border: "1px solid var(--red-bd)",
            fontSize: 12,
            color: "var(--red)",
            marginBottom: 10,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--green-lt)",
            border: "1px solid var(--green-bd)",
            fontSize: 12,
            color: "var(--green)",
            marginBottom: 10,
          }}
        >
          ✓ {success}
        </div>
      )}
      <div className="api-bar" style={{ marginBottom: 0 }}>
        <span>⚙️</span>
        <div style={{ flex: 1 }}>
          <strong>Default AI Provider &amp; Key</strong>{" "}
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            — set once here, used by all users.
          </span>
          {configured && !apiKey && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                marginLeft: 10,
                padding: "2px 8px",
                borderRadius: 100,
                background: "var(--green-lt)",
                border: "1px solid var(--green-bd)",
                fontSize: 11,
                color: "var(--green)",
                fontWeight: 700,
              }}
            >
              ✓ Configured
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              className="form-select"
              style={{ width: 200 }}
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
            </select>

            <input
              className="form-input"
              type="password"
              placeholder={
                provider === "anthropic"
                  ? "sk-ant-api03-…"
                  : provider === "gemini"
                  ? "AIzA…"
                  : "sk-…"
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ flex: 1, minWidth: 260 }}
            />

            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
            >
              {saving ? "Saving…" : configured ? "Update key" : "Save for institution"}
            </button>
          </div>

          <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
            {configured
              ? `A ${provider.toUpperCase()} key is configured. Examiners and moderators will use this automatically.`
              : "No institution-level key set yet. Users will be prompted to add their own."}
          </div>
        </div>
      </div>
    </div>
  );
}
