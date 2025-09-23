"use client";
import React from 'react';

export default function PushPage(){
  return (
    <div style={{ display:'grid', gap:12 }}>
      <h2>Push‑рассылки</h2>
      <p style={{ opacity:.8 }}>Рассылки push‑уведомлений (в разработке). Пока можно использовать раздел «Рассылки».</p>
      <a href="/broadcasts" className="btn">К разделу «Рассылки»</a>
    </div>
  );
}
