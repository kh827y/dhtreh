"use client";
import { useEffect } from 'react';

export default function Toast({ message, type = 'info', onClose, timeout = 3000 }: { message: string; type?: 'info'|'error'|'success'; onClose?: () => void; timeout?: number }) {
  useEffect(() => {
    if (!timeout) return;
    const id = setTimeout(() => onClose && onClose(), timeout);
    return () => clearTimeout(id);
  }, [timeout, onClose]);
  const bg = type === 'error' ? '#3f1d2e' : type === 'success' ? '#1f2e1f' : '#1f2533';
  const color = type === 'error' ? '#f38ba8' : type === 'success' ? '#a6e3a1' : '#cdd6f4';
  return (
    <div style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 1000, display: 'flex', justifyContent: 'center' }}>
      <div style={{ background: bg, color, padding: '10px 14px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>{message}</div>
    </div>
  );
}

