"use client";

import React from "react";

type RangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  disabled?: boolean;
};

export const RangeSlider: React.FC<RangeSliderProps> = ({ min, max, step = 1, value, onChange, disabled }) => {
  const [internal, setInternal] = React.useState<[number, number]>(value);

  React.useEffect(() => {
    setInternal(value);
  }, [value]);

  const handleMinChange = (next: number) => {
    const clamped = Math.min(next, internal[1]);
    setInternal([clamped, internal[1]]);
    onChange([clamped, internal[1]]);
  };

  const handleMaxChange = (next: number) => {
    const clamped = Math.max(next, internal[0]);
    setInternal([internal[0], clamped]);
    onChange([internal[0], clamped]);
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          value={internal[0]}
          min={min}
          max={internal[1]}
          step={step}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          disabled={disabled}
          style={{ padding: 8, width: 80, borderRadius: 6 }}
        />
        <div style={{ flex: 1, position: "relative", height: 32 }}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={internal[0]}
            disabled={disabled}
            onChange={(e) => handleMinChange(Number(e.target.value))}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              pointerEvents: disabled ? "none" : "auto",
            }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={internal[1]}
            disabled={disabled}
            onChange={(e) => handleMaxChange(Number(e.target.value))}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              pointerEvents: disabled ? "none" : "auto",
            }}
          />
        </div>
        <input
          type="number"
          value={internal[1]}
          min={internal[0]}
          max={max}
          step={step}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          disabled={disabled}
          style={{ padding: 8, width: 80, borderRadius: 6 }}
        />
      </div>
    </div>
  );
};

export default RangeSlider;
