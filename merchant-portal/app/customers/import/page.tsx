"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import Link from "next/link";

export default function CustomersImportPage() {
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState(0);
  const [toast, setToast] = React.useState("");

  const handleFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName(null);
      setRows(0);
      return;
    }
    setFileName(file.name);
    setRows(Math.floor(Math.random() * 200) + 20);
  };

  const handleUpload = () => {
    if (!fileName) {
      setToast("Сначала выберите CSV или XLSX файл");
      return;
    }
    setToast(`Импорт ${rows} клиентов поставлен в очередь (демо)`);
  };

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Импорт клиентов</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Загрузите CSV/XLSX файл с данными клиентов</div>
        </div>
        <Link href="/customers" className="btn btn-ghost">
          Назад к списку
        </Link>
      </div>

      {toast && (
        <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(37,211,102,0.25)" }}>
          {toast}
        </div>
      )}

      <Card>
        <CardHeader title="Шаблон для импорта" />
        <CardBody>
          <p style={{ opacity: 0.75, marginBottom: 12 }}>
            Используйте шаблон с колонками: <b>name</b>, <b>phone</b>, <b>email</b>, <b>birthday</b>, <b>balance</b>, <b>level</b>.
          </p>
          <Button variant="secondary">Скачать шаблон</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Загрузка файла" />
        <CardBody style={{ display: "grid", gap: 16 }}>
          <label
            className="glass"
            style={{
              borderRadius: 12,
              border: "1px dashed rgba(255,255,255,0.35)",
              padding: 24,
              display: "grid",
              placeItems: "center",
              gap: 8,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600 }}>Перетащите файл сюда</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Поддерживаются CSV и XLSX</div>
            <Button variant="ghost">Выбрать файл</Button>
            <input type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={handleFile} />
          </label>

          {fileName && (
            <div className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 6 }}>
              <div>
                <strong>{fileName}</strong>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Предпросмотр: {rows} строк</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={handleUpload}>
              Запустить импорт
            </Button>
            <Button variant="ghost" onClick={() => { setFileName(null); setRows(0); }}>
              Очистить
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="История импортов" />
        <CardBody>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, textTransform: "uppercase", opacity: 0.65 }}>
                  <th style={{ padding: "12px 8px" }}>Дата</th>
                  <th style={{ padding: "12px 8px" }}>Файл</th>
                  <th style={{ padding: "12px 8px" }}>Обработано</th>
                  <th style={{ padding: "12px 8px" }}>Ошибок</th>
                  <th style={{ padding: "12px 8px" }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((index) => (
                  <tr key={index} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: "12px 8px" }}>{new Date(Date.now() - index * 86400000).toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>customers-{index + 1}.xlsx</td>
                    <td style={{ padding: "12px 8px" }}>{120 + index * 20}</td>
                    <td style={{ padding: "12px 8px" }}>{index === 0 ? 2 : 0}</td>
                    <td style={{ padding: "12px 8px" }}>{index === 0 ? "Выполнено с предупреждениями" : "Успешно"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
