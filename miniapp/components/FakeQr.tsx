"use client";
import React from "react";
import QrCanvas from "./QrCanvas";

/**
 * Декоративный превью-QR (кодирует строку "fake_qr") для кнопки.
 * Реальный QR теперь доступен на отдельной странице /qr.
 */
export default function FakeQr({ size = 240 }: { size?: number }) {
  const inner = Math.max(120, Math.min(size, 300));
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
      }}
    >
      <QrCanvas value="fake_qr" size={inner} />
    </div>
  );
}
