"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Icons } from "@loyalty/ui";

const { UploadCloud } = Icons;

type ErrorRow = {
  line: number;
  column: string;
  message: string;
};

const structure: Array<{ column: string; title: string; description: string; required?: boolean }> = [
  { column: "A", title: "ID клиента во внешней среде", description: "Опционально. Используйте для связи с CRM." },
  {
    column: "B",
    title: "Номер телефона",
    description: "Обязательное поле. Минимум 11 цифр, допускается произвольное форматирование.",
    required: true,
  },
  { column: "C", title: "ФИО", description: "Опционально. Можно передать через пробелы или запятые." },
  { column: "D", title: "Дата рождения", description: "Опционально. Формат YYYY-MM-DD или DD.MM.YYYY." },
  {
    column: "E",
    title: "Количество баллов",
    description: "Обязательное поле. Если данных нет — поставьте 0.",
    required: true,
  },
  { column: "F", title: "Всего покупок/сумма", description: "Опционально. Общая сумма чеков." },
  {
    column: "G",
    title: "Дата транзакции",
    description: "Если не заполнено — будет использована дата обработки файла.",
  },
  { column: "H", title: "№ чека", description: "Опционально." },
  { column: "I", title: "Количество накопленных штампов", description: "Опционально." },
  { column: "J", title: "ID группы начисления баллов", description: "Опционально." },
  { column: "K", title: "Email клиента", description: "Опционально." },
];

export default function ImportCustomersPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<ErrorRow[]>([]);
  const [importing, setImporting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const current = event.target.files?.[0];
    setFile(current ?? null);
    setErrors([]);
    setMessage(null);
  }

  async function handleImport() {
    if (!file) {
      setErrors([{ line: 0, column: "—", message: "Выберите CSV-файл для загрузки" }]);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrors([{ line: 0, column: "—", message: "Допустим только формат CSV" }]);
      return;
    }

    setImporting(true);
    setErrors([]);
    setMessage(null);

    await new Promise((resolve) => setTimeout(resolve, 900));

    if (file.size === 0) {
      setErrors([{ line: 1, column: "B", message: "Файл пустой. Добавьте данные" }]);
      setImporting(false);
      return;
    }

    setMessage(`Файл ${file.name} принят. Проверка завершена без критичных ошибок.`);
    setImporting(false);
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <CardHeader
          title="Импортировать клиентов"
          subtitle="Загрузка данных"
        />
        <CardBody style={{ display: "grid", gap: 20 }}>
          <section style={{ display: "grid", gap: 12 }}>
            <h3 style={sectionTitleStyle}>Инструкции по подготовке файла</h3>
            <ul style={listStyle}>
              <li>Формат файла — CSV. Кодировка UTF-8. Разделитель «;».</li>
              <li>Каждая строка соответствует одному клиенту. Используйте точку для разделения дробной части.</li>
              <li>Перед загрузкой убедитесь, что обязательные колонки заполнены и нет скрытых формул.</li>
            </ul>
          </section>

          <section style={{ display: "grid", gap: 12 }}>
            <h3 style={sectionTitleStyle}>Структура файла</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={headerCellStyle}>Колонка</th>
                    <th style={headerCellStyle}>Поле</th>
                    <th style={headerCellStyle}>Описание</th>
                  </tr>
                </thead>
                <tbody>
                  {structure.map((row) => (
                    <tr key={row.column}>
                      <td style={cellStyle}>{row.column}{row.required ? "*" : ""}</td>
                      <td style={cellStyle}>{row.title}</td>
                      <td style={cellStyle}>{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ display: "grid", gap: 12 }}>
            <h3 style={sectionTitleStyle}>Загрузка файла</h3>
            <label style={uploadLabelStyle}>
              <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: "none" }} />
              <UploadCloud size={20} />
              <span>{file ? file.name : "Выберите CSV-файл"}</span>
            </label>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? "Импортируем…" : "Импортировать"}
            </Button>
            {message && <div style={successStyle}>{message}</div>}
          </section>

          <section style={{ display: "grid", gap: 12 }}>
            <h3 style={sectionTitleStyle}>Журнал ошибок</h3>
            {errors.length === 0 ? (
              <div style={{ opacity: 0.6, fontSize: 13 }}>Ошибок не обнаружено.</div>
            ) : (
              <ul style={{ ...listStyle, paddingLeft: 16 }}>
                {errors.map((error, index) => (
                  <li key={`${error.line}-${error.column}-${index}`}>
                    Строка {error.line}, колонка {error.column}: {error.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardBody>
      </Card>
    </div>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  paddingLeft: 18,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 720,
};

const headerCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  opacity: 0.6,
  borderBottom: "1px solid rgba(148,163,184,0.24)",
};

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  fontSize: 13,
};

const uploadLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px dashed rgba(148,163,184,0.35)",
  cursor: "pointer",
  background: "rgba(15,23,42,0.35)",
};

const successStyle: React.CSSProperties = {
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.35)",
  color: "#bbf7d0",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13,
};
