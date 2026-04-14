"use client";

import React from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";

export function SystemAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
