"use client";

import React from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

type Option = {
  value: string;
  label: string;
  description?: string;
};

type TagSelectProps = {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  allowMultiple?: boolean;
  disabled?: boolean;
};

export const TagSelect: React.FC<TagSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Выберите",
  allowMultiple = true,
  disabled,
}) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handler = (evt: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(evt.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleValue = (val: string) => {
    if (allowMultiple) {
      if (value.includes(val)) {
        onChange(value.filter((v) => v !== val));
      } else {
        onChange([...value, val]);
      }
    } else {
      if (value.includes(val)) {
        onChange([]);
      } else {
        onChange([val]);
        setOpen(false);
      }
    }
  };

  const selectedOptions = options.filter((opt) => value.includes(opt.value));

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        style={{
          width: '100%',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          padding: '10px 12px',
          borderRadius: 10,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        disabled={disabled}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {selectedOptions.length === 0 && <span style={{ opacity: 0.6 }}>{placeholder}</span>}
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(99,102,241,0.16)',
                color: '#c7d2fe',
                padding: '4px 8px',
                borderRadius: 999,
                fontSize: 12,
              }}
            >
              {opt.label}
              <X size={14} style={{ cursor: 'pointer' }} onClick={(evt) => { evt.stopPropagation(); toggleValue(opt.value); }} />
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {value.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(evt) => {
                evt.stopPropagation();
                onChange([]);
              }}
              style={{ padding: 0 }}
              disabled={disabled}
            >
              <X size={16} />
            </button>
          )}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: 220,
            overflowY: 'auto',
            background: 'rgba(15,23,42,0.94)',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 12,
            boxShadow: '0 12px 42px rgba(15,23,42,0.45)',
            zIndex: 40,
            padding: 8,
          }}
        >
          {options.map((opt) => {
            const active = value.includes(opt.value);
            return (
              <label
                key={opt.value}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: active ? 'rgba(99,102,241,0.18)' : 'transparent',
                  color: active ? '#c7d2fe' : '#e2e8f0',
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleValue(opt.value)}
                  disabled={disabled}
                  style={{ accentColor: '#6366f1' }}
                />
                <div style={{ display: 'grid', gap: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                  {opt.description && <div style={{ fontSize: 11, opacity: 0.7 }}>{opt.description}</div>}
                </div>
              </label>
            );
          })}
          {!options.length && <div style={{ opacity: 0.6, fontSize: 12 }}>Нет доступных значений</div>}
        </div>
      )}
    </div>
  );
};

export default TagSelect;
