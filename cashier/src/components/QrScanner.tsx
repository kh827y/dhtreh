'use client';

import { useEffect, useRef } from 'react';
// @ts-ignore
import { Html5Qrcode } from 'html5-qrcode';

type Props = { onResult: (text: string) => void; onClose: () => void };

// Глобальные барьеры на уровне окна, чтобы переживать HMR/StrictMode
const __qrGlobal = (globalThis as any);
if (!__qrGlobal.__QR_SCANNER_STATE__) {
  __qrGlobal.__QR_SCANNER_STATE__ = { locked: false, lastStop: null as Promise<void> | null };
}
const QR_STATE: { locked: boolean; lastStop: Promise<void> | null } = __qrGlobal.__QR_SCANNER_STATE__;

export default function QrScanner({ onResult, onClose }: Props) {
  const divIdRef = useRef<string>('qr-reader-' + Math.random().toString(36).slice(2));
  const qrRef = useRef<any>(null);
  const startedRef = useRef(false);   // <— защита от повторного старта в StrictMode
  const handledRef = useRef(false);
  const mountedRef = useRef(true);    // <— дополнительная защита от StrictMode
  const onResultRef = useRef(onResult);
  const onCloseRef = useRef(onClose);
  const stopRef = useRef<() => Promise<void> | void>(() => {});
  const startPromiseRef = useRef<Promise<void> | null>(null);

  // держим последние колбеки актуальными, чтобы основной эффект не перезапускался
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;

    const stop = () => {
      // Сохраняем промис последней остановки, чтобы следующий старт мог дождаться
      const p = (async () => {
        try {
          // Дожидаемся завершения стартовой инициализации, если ещё идёт
          if (startPromiseRef.current) {
            try { await startPromiseRef.current; } catch {}
          }
          if (qrRef.current) {
            try { await qrRef.current.stop(); } catch {}
            try { await qrRef.current.clear(); } catch {}
          }
        } finally {
          qrRef.current = null;
          startPromiseRef.current = null;
          startedRef.current = false;
          handledRef.current = false;
          QR_STATE.locked = false; // снимаем глобальный лок только после полной остановки
        }
      })();
      QR_STATE.lastStop = p;
      return p;
    };
    stopRef.current = stop;

    const start = async () => {
      // Ждём завершения последней остановки, если была
      if (QR_STATE.lastStop) {
        try { await QR_STATE.lastStop; } catch {}
      }
      if (QR_STATE.locked || startedRef.current || !mountedRef.current) return;
      QR_STATE.locked = true;
      startedRef.current = true;
      try {
        qrRef.current = new Html5Qrcode(divIdRef.current);
        startPromiseRef.current = qrRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText: string) => {
            if (handledRef.current) return;
            handledRef.current = true;
            // Мгновенно гасим сканер, чтобы исключить повторные колбэки
            void stop();
            try { onResultRef.current(decodedText); } catch {}
            if (mounted) onCloseRef.current();
          },
          () => {}
        );
        await startPromiseRef.current;
      } catch (e: any) {
        // Браузер может кидать AbortError при быстром закрытии/остановке — не показываем алерт в этом случае
        const msg = String(e?.name || e?.message || e || '');
        if (!/AbortError/i.test(msg)) {
          console.error(e);
          alert('Не удалось запустить камеру. Разрешите доступ к камере или используйте другой браузер.');
        }
        QR_STATE.locked = false; // снять лок на случай неуспешного старта
        onCloseRef.current();
      }
    };

    start();
    return () => { 
      mounted = false; 
      mountedRef.current = false;
      void stop(); 
    };
  }, []);

  const handleClose = async () => {
    // Сбрасываем флаги при закрытии
    handledRef.current = false;
    startedRef.current = false;
    // Останавливаем немедленно, чтобы избежать повторных кадров/срабатываний
    try { await stopRef.current(); } catch {}
    onClose();
  };

  return (
    <div style={{ position: 'relative', padding: 12, border: '1px solid #ddd', borderRadius: 12 }}>
      <div id={divIdRef.current} style={{ width: 280, margin: '0 auto' }} />
      <button onClick={handleClose} style={{ position: 'absolute', top: 8, right: 8 }}>✕</button>
      <div style={{ textAlign: 'center', marginTop: 8, color: '#666' }}>Наведи камеру на QR из мини-аппы</div>
    </div>
  );
}
