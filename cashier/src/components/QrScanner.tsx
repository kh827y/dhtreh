'use client';

import { useEffect, useRef } from 'react';
// @ts-ignore — у пакета часто нет типов
import { Html5Qrcode } from 'html5-qrcode';

type Props = {
  onResult: (text: string) => void;
  onClose: () => void;
};

export default function QrScanner({ onResult, onClose }: Props) {
  const divId = 'qr-reader';
  const qrRef = useRef<any>(null);

  useEffect(() => {
    const start = async () => {
      try {
        qrRef.current = new Html5Qrcode(divId);
        // Пытаемся взять заднюю камеру
        await qrRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            // нашли токен — остановим сканер и вернём значение
            stop().finally(() => onResult(decodedText));
          },
          () => {} // игнорируем ошибки сканирования
        );
      } catch (e) {
        console.error(e);
        alert('Не удалось запустить камеру. Разрешите доступ к камере или используйте другой браузер.');
        onClose();
      }
    };
    const stop = async () => {
      try {
        if (qrRef.current?.isScanning) {
          await qrRef.current.stop();
        }
        await qrRef.current?.clear();
      } catch {}
    };
    start();
    return () => { stop(); };
  }, [onResult, onClose]);

  return (
    <div style={{ position: 'relative', padding: 12, border: '1px solid #ddd', borderRadius: 12 }}>
      <div id={divId} style={{ width: 280, margin: '0 auto' }} />
      <button onClick={onClose} style={{ position: 'absolute', top: 8, right: 8 }}>✕</button>
      <div style={{ textAlign: 'center', marginTop: 8, color: '#666' }}>Наведи камеру на QR из мини-аппы</div>
    </div>
  );
}
