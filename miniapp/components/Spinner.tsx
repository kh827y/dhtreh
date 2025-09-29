"use client";
import { CSSProperties } from "react";

export default function Spinner({ size = 18 }: { size?: number }) {
  const s = size;
  const style: CSSProperties = {
    width: s,
    height: s,
    borderRadius: "50%",
    border: `${Math.max(2, Math.floor(s / 8))}px solid #2e3440`,
    borderTopColor: "#89b4fa",
    animation: "spin 1s linear infinite",
  };
  return (
    <div style={{ display: 'inline-block' }}>
      <style>{`@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>
      <div style={style} />
    </div>
  );
}

