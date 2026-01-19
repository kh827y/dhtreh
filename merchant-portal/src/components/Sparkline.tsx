"use client";

import React from "react";

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
};

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 120,
  height = 36,
  stroke = "var(--brand-primary)",
  strokeWidth = 2,
  fill = "rgba(99, 102, 241, 0.12)",
}) => {
  const points = React.useMemo(() => {
    if (!data || data.length === 0) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    return data
      .map((value, index) => {
        const x = (index / Math.max(1, data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(" ");
  }, [data, height, width]);

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          opacity: 0.5,
        }}
      >
        Нет данных
      </div>
    );
  }

  const pathD = React.useMemo(() => {
    if (!points) return "";
    const coords = points.split(" ").map((pair) => pair.split(",").map(Number));
    const first = coords[0];
    if (!coords.length || !first) return "";
    const [firstX = 0, firstY = 0] = first;
    let d = `M ${firstX} ${firstY}`;
    for (let i = 1; i < coords.length; i++) {
      const coord = coords[i];
      if (!coord) continue;
      const [x = 0, y = 0] = coord;
      d += ` L ${x} ${y}`;
    }
    return d;
  }, [points]);

  const areaD = React.useMemo(() => {
    if (!points) return "";
    const coords = points.split(" ").map((pair) => pair.split(",").map(Number));
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (!coords.length || !first || !last) return "";
    const [firstX = 0] = first;
    const baseline = height;
    let d = `M ${firstX} ${baseline}`;
    for (const coord of coords) {
      if (!coord) continue;
      const [x = 0, y = 0] = coord;
      d += ` L ${x} ${y}`;
    }
    d += ` L ${last[0] ?? 0} ${baseline} Z`;
    return d;
  }, [points, height]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={areaD} fill={fill} stroke="none" />
      <path d={pathD} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
};

export default Sparkline;
