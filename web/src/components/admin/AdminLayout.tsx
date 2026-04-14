"use client";

import React from "react";
import { useAuth, roleLabel, userInitials } from "@/lib/auth";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  const initials = user ? userInitials(user.full_name) : "?";
  const role = user ? roleLabel(user.role) : "";

  return (
    <div id="appScreen">
      <div className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">🎓</div>
          <div className="topbar-logo-name">ExamMind</div>
        </div>
        <div className="topbar-sep" />
        <div className="topbar-inst">
          {user?.institution_name ?? "Administration"}
        </div>
        <div className="topbar-right">
          <div className="topbar-user-pill">
            <div className="topbar-avatar">{initials}</div>
            <div>
              <div className="topbar-uname">{user?.full_name ?? "Admin"}</div>
              <div className="topbar-urole">{role}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
      <div className="app-body">{children}</div>
    </div>
  );
}
