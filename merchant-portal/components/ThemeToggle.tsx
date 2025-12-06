"use client";

import React from "react";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      title={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      aria-label="Переключить тему"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: "var(--radius-md)",
        background: "rgba(255, 255, 255, 0.05)",
        border: "1px solid var(--border-subtle)",
        color: "var(--fg-secondary)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.3s ease, opacity 0.3s ease",
          transform: theme === "dark" ? "translateY(0)" : "translateY(-100%)",
          opacity: theme === "dark" ? 1 : 0,
        }}
      >
        <Moon size={18} />
      </span>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.3s ease, opacity 0.3s ease",
          transform: theme === "light" ? "translateY(0)" : "translateY(100%)",
          opacity: theme === "light" ? 1 : 0,
        }}
      >
        <Sun size={18} />
      </span>
    </button>
  );
}
