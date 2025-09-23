'use client';

import React, { useEffect, useRef } from 'react';

type SegmentedInputProps = {
  length: number;
  value: string;
  onChange: (value: string) => void;
  groupSize?: number;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  placeholderChar?: string;
  id?: string;
};

const isDigit = (char: string) => /[0-9]/.test(char);

export function SegmentedInput({
  length,
  value,
  onChange,
  groupSize = 0,
  onComplete,
  autoFocus,
  disabled,
  placeholderChar = '•',
  id,
}: SegmentedInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (next: string) => {
    if (disabled) return;
    const filtered = next
      .split('')
      .filter((ch) => isDigit(ch))
      .join('')
      .slice(0, length);
    onChange(filtered);
    if (filtered.length === length && onComplete) onComplete(filtered);
  };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}
      onClick={() => {
        if (!disabled) inputRef.current?.focus();
      }}
    >
      <input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={length}
        disabled={disabled}
        style={{
          opacity: 0,
          position: 'absolute',
          pointerEvents: 'none',
          height: 0,
          width: 0,
        }}
      />
      {Array.from({ length }).map((_, idx) => (
        <React.Fragment key={idx}>
          <div
            style={{
              width: 34,
              height: 40,
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              background: disabled ? '#f3f3f3' : '#fff',
              boxShadow: value[idx] ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {value[idx] ?? placeholderChar}
          </div>
          {groupSize > 0 && (idx + 1) % groupSize === 0 && idx + 1 < length ? (
            <div style={{ fontSize: 18, opacity: 0.5, margin: '0 2px' }}>-</div>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

export default SegmentedInput;
