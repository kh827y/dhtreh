"use client";
import React from 'react';

export default function TelegramPage(){
  return (
    <div style={{ display:'grid', gap:12 }}>
      <h2>Telegram‑рассылки</h2>
      <p style={{ opacity:.8 }}>Управление рассылками в Telegram (в разработке). Используйте «Рассылки» для общего сценария.</p>
      <a href="/broadcasts" className="btn">К разделу «Рассылки»</a>
    </div>
  );
}
