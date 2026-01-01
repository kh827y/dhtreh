"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  Check,
  FileText,
  X,
} from "lucide-react";
import { readApiError } from "lib/portal-errors";

type ImportResult = {
  total: number;
  customersCreated: number;
  customersUpdated: number;
  receiptsImported: number;
  receiptsSkipped: number;
  statsUpdated: number;
  balancesSet: number;
  errors?: Array<{ row: number; error: string }>;
};

type TableRow = {
  col: string;
  name: string;
  desc: string;
  required?: boolean;
};

const baseRows: TableRow[] = [
  {
    col: "A",
    name: "ID клиента во внешней среде",
    desc: "Опционально. Для связи с внешней CRM или системой.",
  },
  {
    col: "B",
    name: "Номер телефона",
    desc: "Обязательно. Минимум 11 цифр, формат свободный.",
    required: true,
  },
  {
    col: "C",
    name: "ФИО",
    desc: "Опционально. Одной строкой.",
  },
  {
    col: "D",
    name: "Дата рождения",
    desc: "Опционально. DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD или ISO.",
  },
  {
    col: "E",
    name: "Пол",
    desc: "Опционально. М/Ж/m/f/male/female/муж/жен и т.д.",
  },
  {
    col: "F",
    name: "Email",
    desc: "Опционально.",
  },
  {
    col: "G",
    name: "Комментарий",
    desc: "Опционально.",
  },
  {
    col: "H",
    name: "Баланс баллов",
    desc: "Опционально. Жёстко выставляет баланс.",
  },
  {
    col: "I",
    name: "Уровень",
    desc: "Опционально. Точное название уровня.",
  },
  {
    col: "J",
    name: "Блокировка начислений",
    desc: "Опционально. да/нет/true/false/1/0.",
  },
  {
    col: "K",
    name: "Блокировка списаний",
    desc: "Опционально. да/нет/true/false/1/0.",
  },
];

const aggregateRows: TableRow[] = [
  {
    col: "L",
    name: "Сумма покупок",
    desc: "Обязательно для агрегатов. В рублях.",
    required: true,
  },
  {
    col: "M",
    name: "Количество визитов",
    desc: "Обязательно для агрегатов.",
    required: true,
  },
  {
    col: "N",
    name: "Дата последней покупки",
    desc: "Опционально.",
  },
];

const operationRows: TableRow[] = [
  {
    col: "O",
    name: "Сумма операции",
    desc: "Обязательно для операций. В рублях.",
    required: true,
  },
  {
    col: "P",
    name: "Начисленные баллы",
    desc: "Опционально.",
  },
  {
    col: "Q",
    name: "Списанные баллы",
    desc: "Опционально.",
  },
  {
    col: "R",
    name: "Дата операции",
    desc: "Опционально. Если пусто — берётся дата импорта.",
  },
  {
    col: "S",
    name: "ID операции",
    desc: "Обязательно для операций. Должен быть уникален.",
    required: true,
  },
  {
    col: "T",
    name: "Номер чека",
    desc: "Опционально.",
  },
];

const tableGroups = [
  { title: null, rows: baseRows },
  { title: "Если не передаём чеки:", rows: aggregateRows },
  {
    title: "Если хотите передать детальную информацию об операциях:",
    rows: operationRows,
  },
];

export default function ImportCustomersPage() {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      handleFile(event.dataTransfer.files[0]);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFile(event.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Пожалуйста, загрузите файл в формате CSV");
      setSelectedFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }
    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert("Выберите CSV-файл для загрузки.");
      return;
    }

    setUploading(true);
    setImportResult(null);
    setImportError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/portal/customers/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        const message = readApiError(text) || "Не удалось импортировать файл.";
        setImportError(message);
        alert(message);
        return;
      }

      const payload = (await res.json().catch(() => null)) as ImportResult | null;
      if (!payload) {
        const message = "Некорректный ответ сервера.";
        setImportError(message);
        alert(message);
        return;
      }

      setImportResult(payload);
      const errorCount = payload.errors?.length ?? 0;
      if (errorCount > 0) {
        alert(`Импорт завершён с ошибками: ${errorCount}. Проверьте файл и повторите загрузку.`);
      } else {
        alert(
          `Импорт завершён. Клиентов: ${payload.customersCreated} новых, ${payload.customersUpdated} обновлено. ` +
            `Чеков добавлено: ${payload.receiptsImported}. Агрегатов обновлено: ${payload.statsUpdated}.`,
        );
        handleRemoveFile();
      }
    } catch {
      const message = "Ошибка соединения. Попробуйте ещё раз.";
      setImportError(message);
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Импорт данных</h2>
        <p className="text-gray-500 mt-1">
          Массовая загрузка клиентов и истории операций из внешних источников.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Загрузка файла</h3>

            <div
              className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${
                dragActive
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleChange}
                accept=".csv"
              />

              <div className="bg-blue-50 p-4 rounded-full mb-4">
                <Upload size={32} className="text-blue-600" />
              </div>

              <p className="text-sm font-medium text-gray-900 mb-1">
                Перетащите файл сюда или нажмите для выбора
              </p>
              <p className="text-xs text-gray-500">Поддерживается только формат CSV</p>
            </div>

            {selectedFile && (
              <div className="mt-4 p-3 bg-purple-50 border border-purple-100 rounded-lg flex items-center justify-between">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <FileSpreadsheet
                    size={20}
                    className="text-purple-600 flex-shrink-0"
                  />
                  <span className="text-sm font-medium text-purple-900 truncate">
                    {selectedFile.name}
                  </span>
                </div>
                <button
                  onClick={handleRemoveFile}
                  className="text-purple-400 hover:text-purple-700 p-1"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <button
              disabled={!selectedFile || uploading}
              onClick={handleUpload}
              className="w-full mt-4 bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <span>{uploading ? "Импортируем…" : "Начать импорт"}</span>
            </button>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-2">Шаблон файла</h3>
            <p className="text-sm text-gray-500 mb-4">
              Скачайте пример файла, чтобы заполнить колонки корректно.
            </p>
            <a
              href="/import-example.csv"
              download
              className="w-full flex items-center justify-center space-x-2 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              <Download size={16} />
              <span>Скачать пример CSV</span>
            </a>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start space-x-3">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <span className="font-bold block mb-1">Важно</span>
              Баланс из <strong>balance_points</strong> выставляется жёстко и не
              пересчитывается по операциям. <strong>order_id</strong> должен быть
              уникален для мерчанта — дубликаты с разными данными будут
              отклонены. Большие файлы (более 10&nbsp;000 строк) могут
              обрабатываться несколько минут — не закрывайте вкладку до
              завершения загрузки.
            </div>
          </div>

          {importError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start space-x-3">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">
                <span className="font-bold block mb-1">Ошибка импорта</span>
                {importError}
              </div>
            </div>
          )}

          {importResult && (
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4">Результат импорта</h3>
              <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                <div>
                  <span className="font-medium text-gray-900">{importResult.total}</span>{" "}
                  строк в обработке
                </div>
                <div>
                  <span className="font-medium text-gray-900">{importResult.customersCreated}</span>{" "}
                  новых клиентов
                </div>
                <div>
                  <span className="font-medium text-gray-900">{importResult.customersUpdated}</span>{" "}
                  обновлено
                </div>
                <div>
                  <span className="font-medium text-gray-900">{importResult.receiptsImported}</span>{" "}
                  чеков добавлено
                </div>
                <div>
                  <span className="font-medium text-gray-900">{importResult.statsUpdated}</span>{" "}
                  агрегатов
                </div>
                <div>
                  <span className="font-medium text-gray-900">{importResult.balancesSet}</span>{" "}
                  балансов выставлено
                </div>
              </div>

              {(importResult.errors?.length ?? 0) > 0 ? (
                <div className="mt-5">
                  <div className="flex items-center text-sm font-semibold text-red-600">
                    <AlertCircle size={16} className="mr-2" />
                    Ошибки импорта ({importResult.errors?.length})
                  </div>
                  <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-red-100 bg-red-50/40">
                    <ul className="divide-y divide-red-100">
                      {importResult.errors?.map((err, index) => (
                        <li key={`${err.row}-${index}`} className="px-4 py-3">
                          <div className="text-xs text-gray-500 mb-1">
                            Строка {err.row}
                          </div>
                          <div className="text-sm text-red-700">{err.error}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex items-center text-sm font-semibold text-green-600">
                  <Check size={16} className="mr-2" />
                  Импорт выполнен без ошибок
                </div>
              )}
            </div>
          )}
        </div>

        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 text-lg mb-4 flex items-center">
              <FileText size={20} className="mr-2 text-gray-400" />
              Инструкции по подготовке файла
            </h3>

            <ul className="space-y-3">
              <li className="flex items-start space-x-3 text-sm text-gray-600">
                <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>
                  Формат файла — <strong>CSV</strong>. Кодировка <strong>UTF-8</strong>.
                  Разделитель — <strong>точка с запятой (;)</strong>.
                </span>
              </li>
              <li className="flex items-start space-x-3 text-sm text-gray-600">
                <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>
                  Если заполнены <strong>Сумма операции</strong> и{" "}
                  <strong>ID операции</strong>, строка считается операцией. Для
                  агрегатов заполните <strong>Сумма покупок</strong> и{" "}
                  <strong>Количество визитов</strong>.
                </span>
              </li>
              <li className="flex items-start space-x-3 text-sm text-gray-600">
                <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>
                  Суммы — в рублях (целые значения). Поле{" "}
                  <strong>Номер телефона</strong> обязательно в каждой строке.
                </span>
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-900">Структура файла</h3>
              <p className="text-sm text-gray-500 mt-1">
                Порядок колонок (A → T). Названия строго как в таблице.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 font-semibold w-16 text-center">Кол.</th>
                    <th className="px-6 py-3 font-semibold w-80">Поле</th>
                    <th className="px-6 py-3 font-semibold">Описание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tableGroups.map((group, groupIndex) => (
                    <React.Fragment key={group.title ?? `base-${groupIndex}`}>
                      {group.title ? (
                        <tr className="bg-gray-50/70">
                          <td
                            colSpan={3}
                            className="px-6 py-3 text-sm font-semibold text-gray-500"
                          >
                            {group.title}
                          </td>
                        </tr>
                      ) : null}
                      {group.rows.map((row) => (
                        <tr
                          key={row.col}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4 text-center font-mono font-bold text-gray-400 bg-gray-50/30">
                            {row.col}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <span
                                className={`font-medium ${
                                  row.required ? "text-gray-900" : "text-gray-600"
                                }`}
                              >
                                {row.name}
                              </span>
                              {row.required && (
                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 whitespace-nowrap">
                                  Обязательно
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{row.desc}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
