"use client";
import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export function Chart({ option, height = 240, className = '', style }: { option: EChartsOption; height?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{ height, ...(style || {}) }}>
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate theme={undefined} />
    </div>
  );
}
