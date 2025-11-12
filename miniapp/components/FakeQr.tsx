"use client";
import React from "react";

type Block = { x: number; y: number; w?: number; h?: number };

const STATIC_MODULES: Block[] = [
  { x: 48, y: 8, w: 6, h: 6 },
  { x: 60, y: 8, w: 6, h: 10 },
  { x: 72, y: 8, w: 6, h: 6 },
  { x: 84, y: 8, w: 6, h: 6 },
  { x: 96, y: 12, w: 8, h: 6 },
  { x: 48, y: 20, w: 6, h: 6 },
  { x: 60, y: 22, w: 10, h: 6 },
  { x: 74, y: 20, w: 6, h: 6 },
  { x: 86, y: 20, w: 6, h: 10 },
  { x: 48, y: 32, w: 6, h: 6 },
  { x: 60, y: 34, w: 6, h: 6 },
  { x: 72, y: 34, w: 6, h: 10 },
  { x: 84, y: 34, w: 6, h: 6 },
  { x: 36, y: 46, w: 8, h: 6 },
  { x: 50, y: 44, w: 6, h: 10 },
  { x: 62, y: 44, w: 6, h: 6 },
  { x: 74, y: 44, w: 8, h: 6 },
  { x: 88, y: 44, w: 6, h: 6 },
  { x: 30, y: 58, w: 6, h: 6 },
  { x: 42, y: 58, w: 6, h: 6 },
  { x: 54, y: 56, w: 8, h: 10 },
  { x: 70, y: 58, w: 6, h: 6 },
  { x: 82, y: 56, w: 10, h: 6 },
  { x: 94, y: 58, w: 6, h: 6 },
  { x: 30, y: 70, w: 6, h: 6 },
  { x: 42, y: 70, w: 6, h: 6 },
  { x: 54, y: 70, w: 6, h: 6 },
  { x: 66, y: 68, w: 10, h: 6 },
  { x: 80, y: 70, w: 6, h: 10 },
  { x: 94, y: 70, w: 6, h: 6 },
  { x: 24, y: 82, w: 6, h: 6 },
  { x: 36, y: 82, w: 6, h: 6 },
  { x: 48, y: 80, w: 10, h: 10 },
  { x: 64, y: 82, w: 6, h: 6 },
  { x: 76, y: 82, w: 6, h: 6 },
  { x: 88, y: 82, w: 8, h: 6 },
  { x: 24, y: 94, w: 6, h: 6 },
  { x: 36, y: 94, w: 6, h: 6 },
  { x: 48, y: 94, w: 6, h: 6 },
  { x: 60, y: 92, w: 10, h: 6 },
  { x: 76, y: 94, w: 6, h: 6 },
  { x: 88, y: 92, w: 10, h: 8 },
];

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width={28} height={28} rx={3} fill="#0f172a" />
      <rect x={x + 4} y={y + 4} width={20} height={20} rx={2} fill="#ffffff" />
      <rect x={x + 8} y={y + 8} width={12} height={12} rx={1.5} fill="#0f172a" />
    </>
  );
}

/**
 * Статичное превью QR (не обращается к qrcode и не делает лишних вычислений).
 */
export default function FakeQr({ size = 240 }: { size?: number }) {
  const boxSize = Math.max(60, Math.min(size, 320));
  const modules = STATIC_MODULES;
  return (
    <div
      aria-label="QR preview"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        padding: 10,
        background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.12))",
        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.08)",
        maxWidth: boxSize,
        maxHeight: boxSize,
        width: "100%",
        height: "100%",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 120 120"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-hidden="true"
        style={{ borderRadius: 12, display: "block" }}
      >
        <rect width="120" height="120" fill="#ffffff" rx={8} />
        <Finder x={8} y={8} />
        <Finder x={8} y={84} />
        <Finder x={84} y={8} />
        {modules.map(({ x, y, w = 6, h = 6 }, idx) => (
          <rect key={`qr-static-${idx}`} x={x} y={y} width={w} height={h} rx={1.5} fill="#0f172a" />
        ))}
      </svg>
    </div>
  );
}
