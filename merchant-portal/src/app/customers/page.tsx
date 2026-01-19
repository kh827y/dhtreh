"use client";

import React, { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, Upload, ChevronLeft, ChevronRight, Gift, Edit, User, Filter } from "lucide-react";
import { type CustomerRecord, getFullName } from "./data";
import { normalizeCustomer } from "./normalize";
import CustomerFormModal, { type CustomerFormPayload } from "./customer-form-modal";
import ComplimentaryModal from "./complimentary-modal";
import { buildLevelLookups, getAvatarClass, getCustomerLevelRank } from "./level-utils";
import CustomerCard from "./customer-card";
import { readApiError } from "lib/portal-errors";

type LevelOption = {
  id: string;
  name: string;
  label: string;
  isInitial?: boolean;
  thresholdAmount?: number | null;
};

const ITEMS_PER_PAGE = 10;
const CUSTOMERS_FETCH_LIMIT = 200;

function formatCurrency(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value)) || value <= 0) return "-";
  return `₽${Math.round(Number(value)).toLocaleString("ru-RU")}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("ru-RU");
  } catch {
    return "-";
  }
}

function calculateAge(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const month = today.getMonth() - date.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersPageInner />
    </Suspense>
  );
}

function CustomersPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = React.useState<CustomerRecord[]>([]);
  const [levelsCatalog, setLevelsCatalog] = React.useState<LevelOption[]>([]);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [appliedSearch, setAppliedSearch] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [toast, setToast] = React.useState<string | null>(null);
  const [modalState, setModalState] = React.useState<{ mode: "create" | "edit"; customer?: CustomerRecord } | null>(null);
  const [giftTarget, setGiftTarget] = React.useState<CustomerRecord | null>(null);
  const [loading, setLoading] = React.useState(true);

  const selectedCustomerId = searchParams.get("customerId");
  const selectedCustomer = React.useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  function openCustomer(customerId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("customerId", customerId);
    router.push(`${pathname}?${params.toString()}`);
  }

  function closeCustomer() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("customerId");
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  }

  const handleCustomerUpdated = React.useCallback((updated: CustomerRecord) => {
    setCustomers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  const levelLookups = React.useMemo(() => buildLevelLookups(levelsCatalog), [levelsCatalog]);
  const selectedCustomerRank = React.useMemo(() => {
    if (!selectedCustomer) return null;
    return getCustomerLevelRank(selectedCustomer, levelLookups);
  }, [selectedCustomer, levelLookups]);

  const defaultLevelId = React.useMemo(() => {
    const initial = levelsCatalog.find((lvl) => lvl.isInitial);
    return initial?.id ?? levelsCatalog[0]?.id ?? null;
  }, [levelsCatalog]);

  const existingLogins = React.useMemo(
    () => customers.map((customer) => customer.phone || customer.login),
    [customers],
  );

  async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(readApiError(text) || text || res.statusText);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json") || ct.includes("+json")) {
      return text ? ((JSON.parse(text) as unknown) as T) : ((undefined as unknown) as T);
    }
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return (JSON.parse(trimmed) as unknown) as T;
    }
    return ((undefined as unknown) as T);
  }

  const loadCustomers = React.useCallback(async (search: string) => {
    try {
      setLoading(true);
      const baseParams = new URLSearchParams({
        registeredOnly: "0",
        excludeMiniapp: "1",
        limit: String(CUSTOMERS_FETCH_LIMIT),
      });
      if (search) baseParams.set("search", search);
      let offset = 0;
      const all: CustomerRecord[] = [];
      while (true) {
        const params = new URLSearchParams(baseParams);
        params.set("offset", String(offset));
        const batch = await api<any[]>(`/api/customers?${params.toString()}`);
        const normalized = Array.isArray(batch) ? batch.map(normalizeCustomer) : [];
        all.push(...normalized);
        if (normalized.length < CUSTOMERS_FETCH_LIMIT) break;
        offset += CUSTOMERS_FETCH_LIMIT;
      }
      setCustomers(all);
    } catch (e: any) {
      console.error(e);
      setToast(readApiError(e?.message || e) || "Не удалось загрузить клиентов");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCustomers(appliedSearch);
  }, [appliedSearch, loadCustomers]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedSearch(searchTerm.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const payload = await api<any>("/api/portal/loyalty/tiers");
        const source: any[] = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];
        const normalized = source
          .map((row) => ({
            id: typeof row?.id === "string" ? row.id : row?.id != null ? String(row.id) : "",
            name: typeof row?.name === "string" ? row.name : "",
            isInitial: Boolean(row?.isInitial),
            isHidden: Boolean(row?.isHidden),
            thresholdAmount: Number(row?.thresholdAmount ?? 0) || 0,
          }))
          .filter((item) => item.id && item.name)
          .sort((a, b) => {
            if (a.thresholdAmount === b.thresholdAmount) {
              return a.name.localeCompare(b.name);
            }
            return a.thresholdAmount - b.thresholdAmount;
          })
          .map((item) => ({
            id: item.id,
            name: item.name,
            label: item.isHidden ? `${item.name} (скрытый)` : item.name,
            isInitial: item.isInitial,
            thresholdAmount: item.thresholdAmount,
          }));
        if (!aborted) setLevelsCatalog(normalized);
      } catch (error) {
        console.error(error);
        if (!aborted) setLevelsCatalog([]);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);


  React.useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filteredCustomers = customers;

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const startIndex = filteredCustomers.length ? (page - 1) * ITEMS_PER_PAGE : 0;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [appliedSearch]);

  React.useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function openCreateModal() {
    setModalState({ mode: "create" });
  }

  function openEditModal(customer: CustomerRecord, event?: React.MouseEvent) {
    if (event) event.stopPropagation();
    setModalState({ mode: "edit", customer });
  }

  async function handleModalSubmit(payload: CustomerFormPayload) {
    if (!modalState) return;
    const trimmedName = payload.firstName.trim();
    const expireRaw = payload.levelExpireDays.trim();
    const levelExpireDays =
      expireRaw && Number.isFinite(Number(expireRaw)) ? Math.max(0, Math.floor(Number(expireRaw))) : undefined;
    const baseBody = {
      phone: payload.login.trim(),
      email: payload.email.trim() || undefined,
      firstName: trimmedName || undefined,
      name: trimmedName || undefined,
      birthday: payload.birthday || undefined,
      gender: payload.gender,
      comment: payload.comment.trim() || undefined,
      levelId: payload.levelId || undefined,
      levelExpireDays: payload.levelId && levelExpireDays !== undefined ? levelExpireDays : undefined,
    };

    if (modalState.mode === "create") {
      try {
        const created = await api<any>("/api/customers", {
          method: "POST",
          body: JSON.stringify(baseBody),
        });
        const normalized = normalizeCustomer(created);
        let existed = false;
        setCustomers((prev) => {
          const idx = prev.findIndex((item) => item.id === normalized.id);
          if (idx >= 0) {
            existed = true;
            const next = [...prev];
            next[idx] = normalized;
            return next;
          }
          return [normalized, ...prev];
        });
        setToast(existed ? "Клиент уже существует, данные загружены" : "Клиент создан");
        void loadCustomers(appliedSearch);
      } catch (e: any) {
        setToast(readApiError(e?.message || e) || "Ошибка при создании клиента");
      }
    } else if (modalState.mode === "edit" && modalState.customer) {
      const { customer } = modalState;
      try {
        const saved = await api<any>(`/api/customers/${encodeURIComponent(customer.id)}`, {
          method: "PUT",
          body: JSON.stringify(baseBody),
        });
        const normalized = normalizeCustomer(saved ?? { ...customer, ...baseBody });
        setCustomers((prev) => prev.map((item) => (item.id === customer.id ? normalized : item)));
        setToast("Данные клиента обновлены");
        void loadCustomers(appliedSearch);
      } catch (e: any) {
        setToast(readApiError(e?.message || e) || "Ошибка при сохранении клиента");
      }
    }
    setModalState(null);
  }

  const shownFrom = filteredCustomers.length ? startIndex + 1 : 0;
  const shownTo = filteredCustomers.length ? startIndex + paginatedCustomers.length : 0;

  if (selectedCustomerId) {
    return (
      <CustomerCard
        key={selectedCustomerId}
        customerId={selectedCustomerId}
        initialCustomer={selectedCustomer}
        initialLevelRank={selectedCustomerRank}
        onBack={closeCustomer}
        onNavigateToCustomer={openCustomer}
        onCustomerUpdated={handleCustomerUpdated}
      />
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8">
      {toast && (
        <div className="fixed top-24 right-6 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm shadow-lg z-[120]">
          {toast}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Клиенты</h2>
          <p className="text-gray-500 mt-1">База данных покупателей, управление профилями и начислениями.</p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => router.push("/customers/import")}
            className="flex items-center space-x-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Upload size={18} />
            <span>Импорт</span>
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span>Добавить клиента</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Поиск по имени, телефону или email..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Filter size={16} />
            <span>Найдено: {filteredCustomers.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold w-16">#</th>
                <th className="px-6 py-4 font-semibold">Телефон</th>
                <th className="px-6 py-4 font-semibold">Имя</th>
                <th className="px-6 py-4 font-semibold">Email</th>
                <th className="px-6 py-4 font-semibold text-right">Частота (дней)</th>
                <th className="px-6 py-4 font-semibold text-right">Ср. чек</th>
                <th className="px-6 py-4 font-semibold">Дата рожд.</th>
                <th className="px-6 py-4 font-semibold">Возраст</th>
                <th className="px-6 py-4 font-semibold text-right w-32">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    Загрузка клиентов...
                  </td>
                </tr>
              ) : paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    <User size={48} className="mx-auto text-gray-300 mb-4" />
                    <p>Клиенты не найдены.</p>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer) => {
                  const fullName = getFullName(customer) || customer.phone || customer.login || "—";
                  const rank = getCustomerLevelRank(customer, levelLookups);
                  const avatarClass = getAvatarClass(rank);
                  const age = customer.age ?? calculateAge(customer.birthday);
                  const customerUrl = `/customers?customerId=${encodeURIComponent(customer.id)}`;
                  return (
                    <tr
                      key={customer.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={(event) => {
                        const target = event.target as HTMLElement | null;
                        if (target?.closest("button")) return;
                        if (event.metaKey || event.ctrlKey) {
                          window.open(customerUrl, "_blank", "noopener");
                          return;
                        }
                        openCustomer(customer.id);
                      }}
                      onAuxClick={(event) => {
                        if (event.button !== 1) return;
                        const target = event.target as HTMLElement | null;
                        if (target?.closest("button")) return;
                        window.open(customerUrl, "_blank", "noopener");
                      }}
                    >
                      <td className="px-6 py-4 text-gray-400 font-mono text-xs truncate max-w-[120px]">
                        {customer.id}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                        {customer.phone || customer.login || "—"}
                      </td>
                      <td className="px-6 py-4 text-gray-900">
                        <div className="flex items-center space-x-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold ${avatarClass}`}
                          >
                            {fullName.charAt(0)}
                          </div>
                          <span className="truncate max-w-[180px]" title={fullName}>
                            {fullName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500 truncate max-w-[200px]">{customer.email || "-"}</td>
                      <td className="px-6 py-4 text-right text-gray-900">
                        {customer.visitFrequencyDays != null && customer.visitFrequencyDays > 0
                          ? Math.round(customer.visitFrequencyDays)
                          : "-"}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-900 font-medium">
                        {formatCurrency(customer.averageCheck)}
                      </td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(customer.birthday)}</td>
                      <td className="px-6 py-4 text-gray-500">{age ?? "-"}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => openEditModal(customer, e)}
                            title="Редактировать"
                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setGiftTarget(customer);
                            }}
                            title="Подарить баллы"
                            className="p-1.5 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
                          >
                            <Gift size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Показано {shownFrom} - {shownTo} из {filteredCustomers.length}
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-gray-900">Стр. {page}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <CustomerFormModal
        open={Boolean(modalState)}
        mode={modalState?.mode ?? "create"}
        initialValues={
          modalState?.customer
            ? mapCustomerToForm(modalState.customer)
            : { levelId: defaultLevelId }
        }
        loginToIgnore={modalState?.customer?.login}
        levels={levelsCatalog.map((level) => ({ id: level.id, name: level.label, isInitial: level.isInitial }))}
        onClose={() => setModalState(null)}
        onSubmit={handleModalSubmit}
        existingLogins={existingLogins}
      />

      {giftTarget && (
        <ComplimentaryModal
          customer={giftTarget}
          onClose={() => setGiftTarget(null)}
          onSuccess={(message) => {
            setToast(message);
            setGiftTarget(null);
            void loadCustomers(appliedSearch);
          }}
        />
      )}
    </div>
  );
}

function mapCustomerToForm(customer: CustomerRecord): Partial<CustomerFormPayload> {
  const birthdayValue = customer.birthday ? customer.birthday.slice(0, 10) : "";
  return {
    login: customer.phone || customer.login,
    email: customer.email ?? "",
    firstName: getFullName(customer) || "",
    tags: customer.tags.join(", "),
    birthday: birthdayValue,
    levelId: customer.levelId ?? null,
    gender: customer.gender,
    comment: customer.comment ?? "",
  };
}
