"use client";
import React from "react";

type ToggleProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  title?: string;
};

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, disabled, title }) => (
  <label
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
    }}
    title={title}
  >
    <span
      role="switch"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      style={{
        width: 42,
        height: 24,
        borderRadius: 16,
        background: checked ? "var(--brand-primary)" : "rgba(255,255,255,.2)",
        position: "relative",
        transition: "background .2s ease",
        display: "inline-flex",
        alignItems: "center",
        padding: "0 3px",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition: "transform .2s ease",
        }}
      />
    </span>
    <span>{label}</span>
  </label>
);

export default Toggle;
