"use client";
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function QrCanvas({ value, size = 240 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, value, { width: size, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {});
  }, [value, size]);
  return <canvas ref={ref} width={size} height={size} style={{ borderRadius: 8, background: '#fff' }} />;
}

