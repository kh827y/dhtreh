"use client";

import React from "react";

export type LineSeries = {
  name: string;
  color: string;
  values: number[];
};

export type LineChartProps = {
  labels: string[];
  series: LineSeries[];
  height?: number;
};

export const LineChart: React.FC<LineChartProps> = ({ labels, series, height = 220 }) => {
  const maxValue = React.useMemo(() => {
    const all = series.flatMap((s) => s.values);
    return Math.max(1, ...all);
  }, [series]);

  const width = Math.max(320, labels.length * 40);

  const buildPath = (values: number[]) => {
    return values
      .map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * (width - 40) + 20;
        const y = height - ((value / maxValue) * (height - 40)) - 20;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  };

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.16), rgba(15,23,42,0.04))', borderRadius: 16 }}>
        <g>
          {series.map((s) => (
            <path key={s.name} d={buildPath(s.values)} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinecap="round" />
          ))}
        </g>
        <g>
          {labels.map((label, idx) => {
            const x = (idx / Math.max(1, labels.length - 1)) * (width - 40) + 20;
            const y = height - 10;
            return (
              <text key={label + idx} x={x} y={y} fontSize={11} textAnchor="middle" fill="#94a3b8">
                {label}
              </text>
            );
          })}
        </g>
        <g>
          {[0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = height - ((ratio * (height - 40)) + 20);
            return (
              <line key={idx} x1={20} x2={width - 20} y1={y} y2={y} stroke="rgba(148,163,184,0.15)" strokeDasharray="4 6" />
            );
          })}
        </g>
      </svg>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <div key={s.name} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#cbd5f5' }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: s.color, display: 'inline-block' }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
};

export type ColumnSeries = {
  name: string;
  color: string;
  values: number[];
};

export const ColumnChart: React.FC<{ categories: string[]; series: ColumnSeries[]; height?: number }> = ({ categories, series, height = 220 }) => {
  const maxValue = React.useMemo(() => {
    const all = series.flatMap((s) => s.values);
    return Math.max(1, ...all);
  }, [series]);

  const width = Math.max(320, categories.length * 60);
  const totalSeries = series.length;

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ background: 'linear-gradient(160deg, rgba(15,23,42,0.14), rgba(15,23,42,0.02))', borderRadius: 16 }}>
        {categories.map((category, idx) => {
          const groupX = (idx / Math.max(1, categories.length - 1)) * (width - 60) + 30;
          const barWidth = 22;
          return (
            <g key={category}>
              {series.map((s, sIdx) => {
                const value = s.values[idx] ?? 0;
                const barHeight = (value / maxValue) * (height - 40);
                const x = groupX - ((totalSeries - 1) * barWidth) / 2 + sIdx * barWidth;
                const y = height - barHeight - 20;
                return <rect key={s.name} x={x} y={y} width={barWidth - 4} height={barHeight} fill={s.color} rx={6} />;
              })}
              <text x={groupX} y={height - 6} fontSize={11} textAnchor="middle" fill="#94a3b8">{category}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <div key={s.name} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#cbd5f5' }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: s.color, display: 'inline-block' }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
};

export type HeatmapProps = {
  rows: string[];
  cols: string[];
  values: number[][];
};

export const Heatmap: React.FC<HeatmapProps> = ({ rows, cols, values }) => {
  const flat = values.flat();
  const maxValue = Math.max(...flat, 1);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 480 }}>
        <thead>
          <tr>
            <th style={{ padding: '8px 12px', fontSize: 12, opacity: 0.7, textAlign: 'left' }}>День/Час</th>
            {cols.map((col) => (
              <th key={col} style={{ padding: '8px 12px', fontSize: 12, opacity: 0.7, textAlign: 'center' }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={row}>
              <td style={{ padding: '8px 12px', fontSize: 12, opacity: 0.7 }}>{row}</td>
              {cols.map((col, cIdx) => {
                const value = values[rIdx]?.[cIdx] ?? 0;
                const intensity = Math.min(1, value / maxValue);
                const background = `rgba(99,102,241,${0.15 + intensity * 0.65})`;
                return (
                  <td key={col} style={{ padding: '8px 10px', textAlign: 'center', borderRadius: 6, background, color: '#0f172a', fontWeight: 600 }}>
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
