"use client";

import React from "react";
import { usePathname } from "next/navigation";

const styledPaths = new Set<string>([
  "/",
  "/login",
  "/analytics/time",
  "/analytics/portrait",
  "/analytics/referrals",
  "/analytics/rfm",
]);

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const keepStyled = styledPaths.has(pathname || "");

  return <div className={keepStyled ? undefined : "bare-ui"}>{children}</div>;
}
