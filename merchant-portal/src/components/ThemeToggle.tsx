"use client";

import React from "react";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle flex items-center justify-center w-10 h-10 rounded-md bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors relative overflow-hidden"
      title={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      aria-label="Переключить тему"
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
