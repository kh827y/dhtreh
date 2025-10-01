"use client";

import React from 'react';

export type ShareLinks = {
  id: string;
  label: string;
  url: string;
}[];

type SharePromptProps = {
  visible: boolean;
  onClose: () => void;
  links: ShareLinks;
  onOpenLink: (url: string) => void;
};

export const SharePrompt: React.FC<SharePromptProps> = ({ visible, onClose, links, onOpenLink }) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '12px 16px',
        zIndex: 95,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'rgba(12,18,32,0.96)',
          borderRadius: '18px 18px 0 0',
          border: '1px solid rgba(148,163,184,0.18)',
          padding: '24px 20px 28px',
          color: '#f8fafc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Мы рады, что вам понравилось!</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>Пожалуйста, поделитесь своим отзывом в любимом сервисе.</div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {links.map((link) => (
            <button
              key={link.id}
              onClick={() => onOpenLink(link.url)}
              style={{
                border: 'none',
                borderRadius: 12,
                padding: '12px 16px',
                background: 'rgba(30,41,59,0.75)',
                color: '#f8fafc',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
