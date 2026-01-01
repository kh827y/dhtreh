"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useTimezone } from "../../../components/TimezoneProvider";
import { isAllCustomersAudience } from "../../../lib/audience-utils";
import { readApiError } from "lib/portal-errors";

type TabKey = "active" | "archived";

type TelegramCampaign = {
  id: string;
  audienceId: string | null;
  audienceName: string | null;
  audience?: string | null;
  text: string;
  scheduledAt: string | null;
  status: string;
  totalRecipients: number;
  sent: number;
  failed: number;
  imageAssetId?: string | null;
  imageMeta?: {
    fileName?: string | null;
    mimeType?: string | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
};

type CampaignScopeState = {
  active: TelegramCampaign[];
  archived: TelegramCampaign[];
};

type AudienceOption = {
  id: string;
  label: string;
  isSystem: boolean;
  systemKey?: string | null;
  customerCount?: number | null;
};

type FormState = {
  text: string;
  imagePreview: string;
  imageName: string;
  imageMimeType: string;
  imageAssetId: string | null;
  audience: string;
  sendNow: boolean;
  date: string;
  time: string;
};

const MAX_SYMBOLS = 4096;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const DEFAULT_SCOPE_STATE: CampaignScopeState = { active: [], archived: [] };
const ACTIVE_STATUSES = new Set(["SCHEDULED", "RUNNING", "PAUSED"]);
const ARCHIVED_STATUSES = new Set(["COMPLETED", "FAILED"]);

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(readApiError(text) || res.statusText || "Ошибка запроса");
  }
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resolveDateSource(campaign: TelegramCampaign) {
  return campaign.scheduledAt || campaign.updatedAt || campaign.createdAt || null;
}

function formatDateParts(value: string | null) {
  if (!value) return { dateLabel: "—", timeLabel: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { dateLabel: "—", timeLabel: "" };
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return {
    dateLabel: isToday ? "Сегодня" : date.toLocaleDateString("ru-RU"),
    timeLabel: date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
  };
}

function buildLocalDate(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split("-").map((item) => Number(item));
  const [hour, minute] = timeValue.split(":").map((item) => Number(item));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, hour || 0, minute || 0);
}

function normalizeStatus(status: string): "scheduled" | "sending" | "sent" {
  const raw = String(status || "").toUpperCase();
  if (raw === "RUNNING") return "sending";
  if (raw === "SCHEDULED" || raw === "PAUSED") return "scheduled";
  return "sent";
}

export default function TelegramPage() {
  const timezoneInfo = useTimezone();
  const [view, setView] = useState<"list" | "create">("list");
  const [activeTab, setActiveTab] = useState<TabKey>("active");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignScopeState>(DEFAULT_SCOPE_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audiences, setAudiences] = useState<AudienceOption[]>([]);
  const [audiencesLoaded, setAudiencesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const defaultDate = useMemo(() => new Date(), []);

  const [formData, setFormData] = useState<FormState>({
    text: "",
    imagePreview: "",
    imageName: "",
    imageMimeType: "",
    imageAssetId: null,
    audience: "",
    sendNow: true,
    date: toDateInputValue(defaultDate),
    time: "12:00",
  });

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [active, archived] = await Promise.all([
        fetchJson<TelegramCampaign[]>("/api/portal/communications/telegram?scope=ACTIVE"),
        fetchJson<TelegramCampaign[]>("/api/portal/communications/telegram?scope=ARCHIVED"),
      ]);
      setCampaigns({ active, archived });
    } catch (err) {
      setError(readApiError(err) || "Не удалось загрузить рассылки");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudiences = useCallback(async () => {
    if (audiencesLoaded) return;
    try {
      const list = await fetchJson<any[]>("/api/portal/audiences?includeSystem=1");
      const mapped: AudienceOption[] = list
        .filter((item) => !item.archivedAt)
        .map((item) => ({
          id: String(item.id),
          label: String(item.name || "Без названия"),
          isSystem: Boolean(item.isSystem),
          systemKey: item.systemKey ?? null,
          customerCount: item.customerCount ?? null,
        }));
      setAudiences(mapped);
      setAudiencesLoaded(true);
    } catch (err) {
      setAudiencesLoaded(true);
    }
  }, [audiencesLoaded]);

  useEffect(() => {
    loadCampaigns().catch(() => {});
  }, [loadCampaigns]);

  useEffect(() => {
    loadAudiences().catch(() => {});
  }, [loadAudiences]);

  const allAudience = useMemo(
    () => audiences.find((a) => isAllCustomersAudience(a)) ?? null,
    [audiences],
  );

  const activeList = useMemo(
    () => campaigns.active.filter((item) => ACTIVE_STATUSES.has(String(item.status || "").toUpperCase())),
    [campaigns.active],
  );

  const archivedList = useMemo(
    () => campaigns.archived.filter((item) => ARCHIVED_STATUSES.has(String(item.status || "").toUpperCase())),
    [campaigns.archived],
  );

  const filteredNewsletters = activeTab === "active" ? activeList : archivedList;

  const getAudienceName = useCallback(
    (campaign: TelegramCampaign) => {
      if (campaign.audienceName) return campaign.audienceName;
      if (campaign.audienceId) {
        const match = audiences.find((a) => a.id === campaign.audienceId);
        if (match) return match.label;
      }
      const raw = String(campaign.audience || "").trim();
      if (!raw) return allAudience?.label || "Все клиенты";
      if (raw.toUpperCase() === "ALL" || raw.toLowerCase() === "all-customers") {
        return allAudience?.label || "Все клиенты";
      }
      const match = audiences.find((a) => a.label.toLowerCase() === raw.toLowerCase());
      return match ? match.label : raw;
    },
    [audiences, allAudience],
  );

  const openCreate = useCallback(() => {
    setEditingId(null);
    setFormError(null);
    setFormData({
      text: "",
      imagePreview: "",
      imageName: "",
      imageMimeType: "",
      imageAssetId: null,
      audience: allAudience?.id || "",
      sendNow: true,
      date: toDateInputValue(new Date()),
      time: "12:00",
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setView("create");
  }, [allAudience]);

  const closeCreate = useCallback(() => {
    setEditingId(null);
    setFormError(null);
    setView("list");
  }, []);

  const handleEdit = useCallback(
    (campaign: TelegramCampaign) => {
      const dateSource = resolveDateSource(campaign);
      const date = dateSource ? new Date(dateSource) : new Date();
      const imageAssetId = campaign.imageAssetId ? String(campaign.imageAssetId) : null;
      setEditingId(campaign.id);
      setFormError(null);
      setFormData({
        text: campaign.text || "",
        imagePreview: imageAssetId ? `/api/portal/communications/assets/${imageAssetId}` : "",
        imageName: campaign.imageMeta?.fileName || "",
        imageMimeType: campaign.imageMeta?.mimeType || "",
        imageAssetId,
        audience: campaign.audienceId || allAudience?.id || "",
        sendNow: false,
        date: toDateInputValue(date),
        time: toTimeInputValue(date),
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setView("create");
    },
    [allAudience],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Вы уверены, что хотите удалить эту рассылку?")) return;
      setError(null);
      try {
        await fetchJson(`/api/portal/communications/telegram/${encodeURIComponent(id)}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        await loadCampaigns();
      } catch (err) {
        setError(readApiError(err) || "Не удалось удалить рассылку");
      }
    },
    [loadCampaigns],
  );

  const getStatusBadge = useCallback((status: string, failedCount: number) => {
    const normalized = normalizeStatus(status);
    if (normalized === "sending") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 animate-pulse">
          <Loader2 size={12} className="mr-1 animate-spin" /> Выполняется
        </span>
      );
    }
    if (normalized === "scheduled") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <Clock size={12} className="mr-1" /> Запланировано
        </span>
      );
    }
    if (failedCount > 0) {
      return (
        <div className="flex flex-col items-end gap-1">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 size={12} className="mr-1" /> Отправлено
          </span>
          <span
            className="inline-flex items-center text-xs text-red-600 font-medium"
            title="Не доставлено пользователям"
          >
            <AlertTriangle size={10} className="mr-1" /> Не доставлено: {failedCount}
          </span>
        </div>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle2 size={12} className="mr-1" /> Отправлено
      </span>
    );
  }, []);

  const handleImageChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setFormError("Поддерживаются только PNG или JPG");
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setFormError("Размер файла не должен превышать 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const value = typeof reader.result === "string" ? reader.result : "";
        setFormData((prev) => ({
          ...prev,
          imagePreview: value,
          imageName: file.name,
          imageMimeType: file.type,
          imageAssetId: null,
        }));
        setFormError(null);
      };
      reader.onerror = () => {
        setFormError("Не удалось прочитать файл");
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const clearImage = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      imagePreview: "",
      imageName: "",
      imageMimeType: "",
      imageAssetId: null,
    }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = formData.text.trim();
    if (!trimmed) {
      setFormError("Введите текст сообщения");
      return;
    }
    if (trimmed.length > MAX_SYMBOLS) {
      setFormError(`Текст не должен превышать ${MAX_SYMBOLS} символов`);
      return;
    }
    if (!formData.audience) {
      setFormError("Выберите аудиторию");
      return;
    }
    if (!formData.sendNow) {
      const date = buildLocalDate(formData.date, formData.time);
      if (!date || Number.isNaN(date.getTime())) {
        setFormError("Укажите дату и время отправки");
        return;
      }
      if (date.getTime() < Date.now()) {
        setFormError("Дата не может быть в прошлом");
        return;
      }
    }

    const selectedAudience = audiences.find((a) => a.id === formData.audience) || null;
    const scheduledAt = formData.sendNow ? null : buildLocalDate(formData.date, formData.time)?.toISOString() || null;

    let media: Record<string, any> | null = null;
    if (formData.imagePreview) {
      if (formData.imageAssetId) {
        media = { assetId: formData.imageAssetId };
      } else {
        media = {
          imageBase64: formData.imagePreview,
          fileName: formData.imageName || undefined,
          mimeType: formData.imageMimeType || undefined,
        };
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await fetchJson(`/api/portal/communications/telegram/${encodeURIComponent(editingId)}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      }

      await fetchJson("/api/portal/communications/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audienceId: formData.audience,
          audienceName: selectedAudience?.label ?? null,
          text: trimmed,
          scheduledAt,
          timezone: timezoneInfo.iana,
          media,
        }),
      });

      setEditingId(null);
      setView("list");
      setActiveTab("active");
      setFormData({
        text: "",
        imagePreview: "",
        imageName: "",
        imageMimeType: "",
        imageAssetId: null,
        audience: allAudience?.id || "",
        sendNow: true,
        date: toDateInputValue(new Date()),
        time: "12:00",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadCampaigns();
    } catch (err) {
      setFormError(readApiError(err) || "Не удалось сохранить рассылку");
    } finally {
      setSaving(false);
    }
  }, [
    audiences,
    editingId,
    formData,
    loadCampaigns,
    timezoneInfo.iana,
    allAudience,
  ]);

  if (view === "create") {
    return (
      <div className="p-8 max-w-[1600px] mx-auto ">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center space-x-4 mb-8">
            <button
              onClick={closeCreate}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
              aria-label="Назад"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {editingId ? "Редактирование рассылки" : "Новая рассылка"}
              </h2>
              <p className="text-sm text-gray-500">Создание сообщения для Telegram бота</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 space-y-6">
              {formError && (
                <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Текст сообщения</label>
                <div className="relative">
                  <textarea
                    value={formData.text}
                    onChange={(e) => {
                      setFormData({ ...formData, text: e.target.value });
                      setFormError(null);
                    }}
                    placeholder="Введите текст..."
                    rows={6}
                    maxLength={MAX_SYMBOLS}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y"
                  />
                </div>
                <div className="mt-2 flex items-start space-x-2 text-xs text-gray-500">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <p>Поддерживается Markdown разметка: *жирный*, _курсив_, [ссылка](url).</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Изображение (опционально)</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    ref={fileInputRef}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {formData.imagePreview ? (
                    <div className="relative h-48 w-full flex items-center justify-center">
                      <img
                        src={formData.imagePreview}
                        alt="Preview"
                        className="max-h-full max-w-full object-contain rounded-md shadow-sm"
                      />
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          clearImage();
                        }}
                        className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-1.5 shadow-md text-gray-500 hover:text-red-600 border border-gray-200"
                        type="button"
                        aria-label="Удалить изображение"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-gray-500 pointer-events-none">
                      <ImageIcon size={32} className="mb-2 text-gray-400" />
                      <span className="text-sm font-medium">Нажмите или перетащите изображение</span>
                      <span className="text-xs text-gray-400 mt-1">PNG, JPG до 5MB</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Получатели</label>
                <select
                  value={formData.audience}
                  onChange={(e) => {
                    setFormData({ ...formData, audience: e.target.value });
                    setFormError(null);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {audiences.map((aud) => (
                    <option key={aud.id} value={aud.id}>
                      {aud.label}
                      {typeof aud.customerCount === "number" ? ` (~${aud.customerCount} чел.)` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <label className="flex items-center space-x-2 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sendNow}
                    onChange={(e) => {
                      setFormData({ ...formData, sendNow: e.target.checked });
                      setFormError(null);
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">Отправить сейчас</span>
                </label>

                <div
                  className={`grid grid-cols-2 gap-4 transition-opacity duration-200 ${formData.sendNow ? "opacity-50 pointer-events-none" : "opacity-100"}`}
                >
                  <div>
                    <label htmlFor="telegram-date" className="block text-xs font-medium text-gray-500 mb-1">
                      Дата
                    </label>
                    <input
                      id="telegram-date"
                      type="date"
                      value={formData.date}
                      onChange={(e) => {
                        setFormData({ ...formData, date: e.target.value });
                        setFormError(null);
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="telegram-time" className="block text-xs font-medium text-gray-500 mb-1">
                      Время
                    </label>
                    <input
                      id="telegram-time"
                      type="time"
                      value={formData.time}
                      onChange={(e) => {
                        setFormData({ ...formData, time: e.target.value });
                        setFormError(null);
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t border-gray-100">
              <button
                onClick={closeCreate}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                type="button"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                type="button"
                disabled={saving}
              >
                <Send size={16} />
                <span>{formData.sendNow ? "Отправить" : "Запланировать"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-bold text-gray-900">Telegram-рассылки</h2>
          </div>
          <p className="text-gray-500 mt-1">Отправка сообщений пользователям Telegram бота.</p>
        </div>

        <button
          onClick={openCreate}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          type="button"
        >
          <Plus size={18} />
          <span>Создать рассылку</span>
        </button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("active")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === "active" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
            type="button"
          >
            Активные
            <span
              className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === "active" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}
            >
              {activeList.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("archived")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === "archived" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
            type="button"
          >
            Архивные
            <span
              className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === "archived" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}
            >
              {archivedList.length}
            </span>
          </button>
        </nav>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
          Загрузка...
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 font-semibold w-16">Фото</th>
                  <th className="px-6 py-4 font-semibold w-40">Дата отправки</th>
                  <th className="px-6 py-4 font-semibold">Сообщение</th>
                  <th className="px-6 py-4 font-semibold">Аудитория</th>
                  <th className="px-6 py-4 font-semibold text-right">Статус</th>
                  {activeTab === "active" && (
                    <th className="px-6 py-4 font-semibold text-right w-24">Действия</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredNewsletters.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeTab === "active" ? 6 : 5}
                      className="px-6 py-10 text-center text-gray-500"
                    >
                      <Send size={48} className="mx-auto text-gray-300 mb-4" />
                      <p>
                        {activeTab === "active"
                          ? "Нет активных или запланированных рассылок"
                          : "Архив рассылок пуст"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredNewsletters.map((item) => {
                    const { dateLabel, timeLabel } = formatDateParts(resolveDateSource(item));
                    const statusKey = normalizeStatus(item.status);
                    const isEditable = statusKey === "scheduled" && String(item.status || "").toUpperCase() === "SCHEDULED";
                    const audienceName = getAudienceName(item);
                    const imageUrl = item.imageAssetId
                      ? `/api/portal/communications/assets/${item.imageAssetId}`
                      : null;

                    return (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          {imageUrl ? (
                            <div
                              className="h-10 w-10 rounded-lg overflow-hidden border border-gray-200 cursor-zoom-in hover:opacity-80 transition-opacity"
                              onClick={() => setExpandedImage(imageUrl)}
                            >
                              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                              <ImageIcon size={16} />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">{dateLabel}</span>
                            <span className="text-xs text-gray-500">{timeLabel}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-900">
                          <p className="line-clamp-2 max-w-xl break-words">{item.text}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          <div className="flex items-center space-x-2">
                            <Users size={14} />
                            <span className="break-words">{audienceName}</span>
                          </div>
                          {item.totalRecipients ? (
                            <span className="text-xs text-gray-400 mt-1 block">~{item.totalRecipients} получателей</span>
                          ) : null}
                        </td>
                        <td className="px-6 py-4 text-right">{getStatusBadge(item.status, item.failed)}</td>
                        {activeTab === "active" && (
                          <td className="px-6 py-4 text-right">
                            {isEditable && (
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => handleEdit(item)}
                                  title="Редактировать"
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  type="button"
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  title="Удалить"
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  type="button"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expandedImage &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 "
            onClick={() => setExpandedImage(null)}
          >
            <div className="relative max-w-5xl max-h-full" onClick={(e) => e.stopPropagation()}>
              <img src={expandedImage} alt="Expanded" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
              <button
                onClick={() => setExpandedImage(null)}
                className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors p-2"
                type="button"
              >
                <X size={32} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
