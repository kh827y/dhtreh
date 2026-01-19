"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Series = { key: string; color: string; points: Array<{ x: number; y: number }>; enabled: boolean };

export default function SimpleLineChart({ width = 720, height = 240, series, xLabels }: { width?: number; height?: number; series: Series[]; xLabels?: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Общие отступы, чтобы соответствовать обработчикам мыши и рисованию
  const padding = useMemo(() => ({ l: 40, r: 10, t: 10, b: 28 }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);

    // compute bounds
    const enabled = series.filter(s=>s.enabled);
    const allPts = enabled.flatMap(s=>s.points);
    const W = width - padding.l - padding.r;
    const H = height - padding.t - padding.b;
    const maxX = Math.max(1, ...allPts.map(p => p.x));
    const minX = Math.min(0, ...allPts.map(p => p.x));
    const maxY = Math.max(1, ...allPts.map(p => p.y));
    const minY = Math.min(0, ...allPts.map(p => p.y));

    const xTo = (x: number) => padding.l + (x - minX) / (maxX - minX || 1) * W;
    const yTo = (y: number) => padding.t + H - (y - minY) / (maxY - minY || 1) * H;

    // bg
    ctx.fillStyle = '#0e1629';
    ctx.fillRect(0, 0, width, height);

    // grid
    ctx.strokeStyle = '#1e2a44';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.t + i * (H / 4);
      ctx.beginPath(); ctx.moveTo(padding.l, y); ctx.lineTo(width - padding.r, y); ctx.stroke();
    }

    // axes labels
    ctx.fillStyle = '#7f8ea3';
    ctx.font = '10px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    if (xLabels && xLabels.length > 0) {
      const n = xLabels.length;
      for (let i = 0; i < n; i++) {
        const x = padding.l + (i / (n - 1 || 1)) * W;
        ctx.fillText(xLabels[i]!, x - 8, padding.t + H + 18);
      }
    }

    // draw series lines
    for (const s of enabled) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.points.forEach((p, idx) => {
        const X = xTo(p.x), Y = yTo(p.y);
        if (idx === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.stroke();
    }

    // hover guideline and points
    const n = xLabels?.length || 0;
    const hasHover = hoverIndex != null && n > 0 && hoverIndex >= 0 && hoverIndex < n;
    if (hasHover) {
      const hx = xTo(hoverIndex!);
      // vertical guideline
      ctx.strokeStyle = '#2b3b61';
      ctx.lineWidth = 1;
      ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(hx, padding.t); ctx.lineTo(hx, padding.t + H); ctx.stroke();
      ctx.setLineDash([]);

      // points on each series and collect tooltip rows
      const rows: Array<{ key: string; color: string; value: number }> = [];
      for (const s of enabled) {
        const pt = s.points.find(p => Math.round(p.x) === hoverIndex);
        if (!pt) continue;
        const X = xTo(pt.x), Y = yTo(pt.y);
        ctx.fillStyle = '#0e1629';
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X, Y, 3.5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        rows.push({ key: s.key, color: s.color, value: pt.y });
      }

      // tooltip box
      if (rows.length > 0) {
        const label = xLabels?.[hoverIndex!] || String(hoverIndex);
        const boxW = 160;
        const boxH = 20 + rows.length * 16 + 8;
        const boxX = Math.min(Math.max(8, hx + 8), width - boxW - 8);
        const boxY = Math.max(8, padding.t + 8);
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(boxX+1, boxY+1, boxW, boxH);
        // panel
        ctx.fillStyle = '#0b1220';
        ctx.strokeStyle = '#1e2a44';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(boxX, boxY, boxW, boxH); ctx.fill(); ctx.stroke();
        // text
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText(label, boxX + 8, boxY + 16);
        let yy = boxY + 16 + 8;
        for (const r of rows) {
          // color dot
          ctx.fillStyle = r.color; ctx.fillRect(boxX + 8, yy - 8, 8, 8);
          ctx.fillStyle = '#9fb0c9';
          const text = `${r.key}: ${Math.round(r.value)}`;
          ctx.fillText(text, boxX + 8 + 12, yy);
          yy += 16;
        }
      }
    }
  }, [series, width, height, xLabels, hoverIndex, padding]);

  const handleMouseMove: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const n = xLabels?.length || 0;
    if (n <= 1) { setHoverIndex(null); return; }
    const W = width - padding.l - padding.r;
    const rel = (x - padding.l) / (W || 1);
    const idx = Math.round(rel * (n - 1));
    if (idx >= 0 && idx < n) setHoverIndex(idx); else setHoverIndex(null);
  };

  const handleMouseLeave = () => setHoverIndex(null);

  return <canvas ref={canvasRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />;
}
