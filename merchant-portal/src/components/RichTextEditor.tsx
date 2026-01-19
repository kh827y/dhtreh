"use client";
import React from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
};

const COMMANDS: { label: string; command: string }[] = [
  { label: "Ж", command: "bold" },
  { label: "К", command: "italic" },
  { label: "U", command: "underline" },
  { label: "•", command: "insertUnorderedList" },
  { label: "1.", command: "insertOrderedList" },
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, label }) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (node.innerHTML === value) return;
    node.innerHTML = value || "";
  }, [value]);

  const execute = (command: string) => {
    if (typeof document === "undefined") return;
    document.execCommand(command);
    const node = ref.current;
    if (!node) return;
    onChange(node.innerHTML);
  };

  const handleInput = () => {
    const node = ref.current;
    if (!node) return;
    onChange(node.innerHTML);
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {label && <span style={{ fontSize: 12, opacity: 0.7 }}>{label}</span>}
      <div
        className="glass"
        style={{
          position: "relative",
          borderRadius: 12,
          border: focused ? "1px solid rgba(37,211,102,0.5)" : "1px solid rgba(255,255,255,0.08)",
          padding: 8,
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {COMMANDS.map((item) => (
            <button
              key={item.command}
              type="button"
              onClick={() => execute(item.command)}
              className="btn btn-ghost"
              style={{ padding: "6px 10px", fontSize: 12 }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ position: "relative" }}>
          <div
            ref={ref}
            contentEditable
            onInput={handleInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              minHeight: 140,
              padding: 12,
              borderRadius: 8,
              outline: "none",
              background: "rgba(0,0,0,0.15)",
            }}
          />
          {!value && !focused && placeholder ? (
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 16,
                right: 16,
                pointerEvents: "none",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {placeholder}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RichTextEditor;
