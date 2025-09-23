"use client";

import React from "react";

type SectionItem = {
  href: string;
  label: string;
};

export type SidebarSection = {
  id: string;
  title: string;
  items: SectionItem[];
};

type SidebarNavProps = {
  sections: SidebarSection[];
};

function LinkItem({ href, label }: SectionItem) {
  return (
    <a
      href={href}
      className="btn btn-ghost"
      style={{
        textDecoration: "none",
        justifyContent: "flex-start",
        padding: "8px 10px",
        width: "100%",
        fontSize: 14,
      }}
    >
      {label}
    </a>
  );
}

export default function SidebarNav({ sections }: SidebarNavProps) {
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    sections.forEach((section) => {
      initialState[section.id] = true;
    });
    return initialState;
  });

  const toggleSection = React.useCallback((id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <nav style={{ display: "grid", gap: 8 }}>
      {sections.map((section) => {
        const isOpen = openSections[section.id];
        return (
          <div key={section.id}>
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                color: "rgba(226,232,240,0.75)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span>{section.title}</span>
              <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen && (
              <div style={{ display: "grid", gap: 4, marginTop: 2 }}>
                {section.items.map((item) => (
                  <LinkItem key={item.href} {...item} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
