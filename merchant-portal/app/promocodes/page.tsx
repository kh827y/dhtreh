"use client";
import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
import Toggle from "../../components/Toggle";
import { Pencil, Archive, RotateCcw } from "lucide-react";

type PromocodeRow = {
  id: string;
  name?: string;
  code?: string | null;
  description?: string;
  value: number;
  status: string;
  isActive: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  totalUsed?: number;
  usageLimitType?: string;
  usageLimitValue?: number | null;
  perCustomerLimit?: number | null;
  metadata?: Record<string, any> | null;
};

type LevelOption = { id: string; name: string };

type FormState = {
  code: string;
  description: string;
  awardPoints: boolean;
  points: string;
  burnEnabled: boolean;
  burnDays: string;
  levelEnabled: boolean;
  levelId: string;
  usageLimit: 'none' | 'once_total' | 'once_per_customer';
  usageLimitSelection: 'none' | 'per_customer' | 'limited';
  usageLimitValue: string;
  levelExpireDays: string;
  usagePeriodEnabled: boolean;
  usagePeriodDays: string;
  recentVisitEnabled: boolean;
  recentVisitHours: string;
  validFrom: string;
  validUntil: string;
};

const initialForm: FormState = {
  code: "",
  description: "",
  awardPoints: true,
  points: "0",
  burnEnabled: false,
  burnDays: "",
  levelEnabled: false,
  levelId: "",
  usageLimit: "none",
  usageLimitSelection: "none",
  usageLimitValue: "1",
  levelExpireDays: "0",
  usagePeriodEnabled: false,
  usagePeriodDays: "",
  recentVisitEnabled: false,
  recentVisitHours: "0",
  validFrom: "",
  validUntil: "",
};

function formatDate(date?: string | null) {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleDateString("ru-RU");
  } catch {
    return "—";
  }
}

function formatRange(from?: string | null, to?: string | null) {
  if (!from && !to) return "Бессрочно";
  if (from && to) return `${formatDate(from)} — ${formatDate(to)}`;
  if (from) return `с ${formatDate(from)}`;
  return `до ${formatDate(to)}`;
}

function levelName(meta?: Record<string, any> | null, levels?: LevelOption[]) {
  if (!meta?.level || !meta.level.enabled) return "—";
  const target = String(meta.level.target || "");
  const found = levels?.find((lvl) => lvl.id === target);
  return found ? found.name : target || "—";
}

export default function PromocodesPage() {
  const [tab, setTab] = React.useState<'ACTIVE' | 'ARCHIVE'>('ACTIVE');
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<PromocodeRow[]>([]);
  const [error, setError] = React.useState('');
  const [modalMode, setModalMode] = React.useState<'create' | 'edit' | null>(null);
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [editing, setEditing] = React.useState<PromocodeRow | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [levels, setLevels] = React.useState<LevelOption[]>([]);
  const [levelsLoading, setLevelsLoading] = React.useState(false);
  const [formError, setFormError] = React.useState('');

const summaryText = React.useMemo(() => {
  const total = items.length;
  if (!total) return 'Показаны записи 0-0 из 0';
  return `Показаны записи 1-${total} из ${total}`;
}, [items]);
const usageLimitSelection = form.usageLimitSelection;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      qs.set('status', tab === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVE');
      qs.set('limit', '200');
      const res = await fetch(`/api/portal/promocodes?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Не удалось загрузить промокоды');
      const rows: PromocodeRow[] = Array.isArray(data?.items) ? data.items : [];
      setItems(rows);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const ensureLevels = React.useCallback(async () => {
    if (levels.length || levelsLoading) return;
    setLevelsLoading(true);
    try {
      const res = await fetch("/api/portal/loyalty/tiers");
      const data = await res.json();
      if (res.ok) {
        const source: any[] = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];
        const lv: LevelOption[] = source
          .filter((row) => row)
          .map((row) => ({
            id: String(row.id || ""),
            name: row.isHidden ? `${String(row.name || "")} (скрытый)` : String(row.name || ""),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setLevels(lv);
      } else {
        setLevels([]);
      }
    } catch {
      setLevels([]);
    } finally {
      setLevelsLoading(false);
    }
  }, [levels.length, levelsLoading]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { ensureLevels(); }, [ensureLevels]);

  const openCreate = () => {
    setForm(initialForm);
    setFormError('');
    setEditing(null);
    setModalMode('create');
    ensureLevels();
  };

  const openEdit = (row: PromocodeRow) => {
    setEditing(row);
    setFormError('');
    setForm(mapRowToForm(row));
    setModalMode('edit');
    ensureLevels();
  };

  const closeModal = () => {
    setModalMode(null);
    setEditing(null);
    setForm(initialForm);
    setFormError('');
  };

  const handleArchive = async (row: PromocodeRow) => {
    try {
      const res = await fetch('/api/portal/promocodes/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promoCodeId: row.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e: any) {
      alert(String(e?.message || e));
    }
  };

  const handleActivate = async (row: PromocodeRow) => {
    try {
      const res = await fetch('/api/portal/promocodes/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promoCodeId: row.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e: any) {
      alert(String(e?.message || e));
    }
  };

  const handleSubmit = async () => {
    if (!form.code.trim()) {
      setFormError('Укажите промокод');
      return;
    }
    if (form.awardPoints && Number(form.points || 0) <= 0) {
      setFormError('Укажите количество баллов');
      return;
    }
    if (form.levelEnabled && !form.levelId) {
      setFormError('Выберите уровень');
      return;
    }
    if (form.levelEnabled && Number(form.levelExpireDays || 0) < 0) {
      setFormError('Срок действия уровня не может быть отрицательным');
      return;
    }
    if (form.usagePeriodEnabled && Number(form.usagePeriodDays || 0) <= 0) {
      setFormError('Укажите период использования в днях');
      return;
    }
    if (form.usageLimit === 'once_total' && Number(form.usageLimitValue || 0) <= 0) {
      setFormError('Укажите лимит применений промокода');
      return;
    }
    setSubmitting(true);
    setFormError('');
    const submitOnce = async (overwrite = false) => {
      const payload = { ...buildPayload(form), ...(overwrite ? { overwrite: true } : {}) };
      if (modalMode === 'create') {
        const res = await fetch('/api/portal/promocodes/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      } else if (modalMode === 'edit' && editing) {
        const res = await fetch(`/api/portal/promocodes/${encodeURIComponent(editing.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      }
    };

    try {
      await submitOnce(false);
      closeModal();
      await load();
    } catch (e: any) {
      const msg = String(e?.message || e);
      const duplicate =
        msg.includes('Промокод с таким названием уже существует') ||
        msg.toLowerCase().includes('unique constraint');
      if (duplicate) {
        const confirmOverwrite = window.confirm('Промокод с таким названием уже существует, хотите перезаписать?');
        if (confirmOverwrite) {
          try {
            await submitOnce(true);
            closeModal();
            await load();
            return;
          } catch (err: any) {
            setFormError(String(err?.message || err));
          }
        } else {
          setFormError('Промокод с таким названием уже существует');
        }
      } else {
        setFormError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderActions = (row: PromocodeRow) => {
    return (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" title="Редактировать" onClick={() => openEdit(row)}>
          <Pencil size={16} />
        </button>
        {tab === 'ACTIVE' ? (
          <button className="btn btn-ghost" title="В архив" onClick={() => handleArchive(row)}>
            <Archive size={16} />
          </button>
        ) : (
          <button className="btn btn-ghost" title="Вернуть из архива" onClick={() => handleActivate(row)}>
            <RotateCcw size={16} />
          </button>
        )}
      </div>
    );
  };

  const renderRows = () => {
    if (loading) return <Skeleton height={220} />;
    if (!items.length) return <div style={{ padding: 12, opacity: 0.7 }}>Промокоды отсутствуют</div>;
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr 0.8fr 1fr 1fr 140px',
          fontSize: 12,
          textTransform: 'uppercase',
          opacity: 0.6,
          padding: '6px 12px',
        }}>
          <div>Промокод</div>
          <div>Описание</div>
          <div>Начислить баллов</div>
          <div>Присвоить уровень</div>
          <div>Срок действия</div>
          <div>Использован раз</div>
        </div>
        {items.map((row) => (
          <div
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 0.8fr 1fr 1fr 140px',
              gap: 12,
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(10,14,24,0.35)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{row.code || row.name || row.id}</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{row.name && row.name !== row.code ? row.name : ''}</div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{row.description || '—'}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              {row.metadata?.awardPoints === false || row.value <= 0 ? '—' : row.value}
            </div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{levelName(row.metadata, levels) || '—'}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{formatRange(row.validFrom, row.validUntil)}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{typeof row.totalUsed === 'number' ? row.totalUsed : '—'}</div>
            <div style={{ gridColumn: '1 / -1' }}>{renderActions(row)}</div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Промокоды</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Управляйте промокодами на начисление баллов</div>
        </div>
        <Button variant="primary" onClick={openCreate}>Создать промокод</Button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn"
          style={{
            minWidth: 140,
            background: tab === 'ACTIVE' ? 'var(--brand-primary)' : 'rgba(255,255,255,.08)',
            color: tab === 'ACTIVE' ? '#0b0f19' : '#fff',
          }}
          onClick={() => setTab('ACTIVE')}
        >
          Активные
        </button>
        <button
          className="btn"
          style={{
            minWidth: 140,
            background: tab === 'ARCHIVE' ? 'var(--brand-primary)' : 'rgba(255,255,255,.08)',
            color: tab === 'ARCHIVE' ? '#0b0f19' : '#fff',
          }}
          onClick={() => setTab('ARCHIVE')}
        >
          Архивные
        </button>
      </div>

      <div style={{ fontSize: 13, opacity: 0.7 }}>{loading ? 'Загрузка…' : summaryText}</div>
      {error && <div style={{ color: '#f87171' }}>{error}</div>}

      <Card>
        <CardHeader title={tab === 'ACTIVE' ? 'Активные промокоды' : 'Архивные промокоды'} />
        <CardBody>{renderRows()}</CardBody>
      </Card>

      {modalMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,8,16,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 90 }}>
          <div style={{ width: 'min(840px, 96vw)', maxHeight: '92vh', overflowY: 'auto', background: 'rgba(12,16,26,0.96)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {modalMode === 'create' ? 'Создать промокод' : modalMode === 'edit' ? 'Редактировать промокод' : 'Детали промокода'}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Балльный промокод для клиентов</div>
              </div>
              <button className="btn btn-ghost" onClick={closeModal}>✕</button>
            </div>
            <div style={{ padding: 24, display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Промокод *</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    disabled={false}
                    style={{ padding: 10, borderRadius: 8 }}
                    placeholder="Например, BONUS100"
                  />
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Описание</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    disabled={false}
                    style={{ padding: 10, borderRadius: 8 }}
                    placeholder="Видите только вы"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Начислять баллы за ввод промокода</label>
                  <Toggle
                    checked={form.awardPoints}
                    onChange={(value) => setForm((prev) => ({ ...prev, awardPoints: value }))}
                    label={form.awardPoints ? 'Включено' : 'Выключено'}
                    disabled={false}
                  />
                </div>
                {form.awardPoints && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 13, opacity: 0.8 }}>Введите количество баллов</label>
                    <input
                      value={form.points}
                      onChange={(e) => setForm((prev) => ({ ...prev, points: e.target.value.replace(/[^0-9]/g, '') }))}
                      disabled={false}
                      inputMode="numeric"
                      style={{ padding: 10, borderRadius: 8 }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Включить сгорание баллов</label>
                  <Toggle
                    checked={form.burnEnabled}
                    onChange={(value) => setForm((prev) => ({ ...prev, burnEnabled: value, burnDays: value ? (prev.burnDays || '30') : '' }))}
                    label={form.burnEnabled ? 'Включено' : 'Выключено'}
                    disabled={false}
                  />
                </div>
                {form.burnEnabled && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 13, opacity: 0.8 }}>Через сколько дней баллы сгорят?</label>
                    <input
                      value={form.burnDays}
                      onChange={(e) => setForm((prev) => ({ ...prev, burnDays: e.target.value.replace(/[^0-9]/g, '') }))}
                      disabled={false}
                      inputMode="numeric"
                      style={{ padding: 10, borderRadius: 8 }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Изменить уровень клиента за ввод промокода</label>
                  <Toggle
                    checked={form.levelEnabled}
                    onChange={(value) => setForm((prev) => ({ ...prev, levelEnabled: value }))}
                    label={form.levelEnabled ? 'Включено' : 'Выключено'}
                    disabled={false}
                  />
                </div>
                {form.levelEnabled && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontSize: 13, opacity: 0.8 }}>Выберите уровень</label>
                      <select
                        value={form.levelId}
                        onChange={(e) => setForm((prev) => ({ ...prev, levelId: e.target.value }))}
                        disabled={levelsLoading}
                        style={{ padding: 10, borderRadius: 8 }}
                      >
                        <option value="">— выберите —</option>
                        {levels.map((lvl) => (
                          <option key={lvl.id} value={lvl.id}>{lvl.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontSize: 13, opacity: 0.8 }}>Срок действия уровня (дней)</label>
                      <input
                        value={form.levelExpireDays}
                        onChange={(e) => setForm((prev) => ({ ...prev, levelExpireDays: e.target.value.replace(/[^0-9]/g, '') }))}
                        disabled={false}
                        inputMode="numeric"
                        style={{ padding: 10, borderRadius: 8 }}
                        placeholder="0 — бессрочно"
                      />
                      <div style={{ fontSize: 12, opacity: 0.6 }}>0 — бессрочно, при истечении назначаем уровень по сумме покупок.</div>
                    </div>
                  </div>
                )}
              </div>

                <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Ограничения на количество использований</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    style={{
                      background: usageLimitSelection === 'none' ? 'var(--brand-primary)' : 'rgba(255,255,255,.08)',
                      color: usageLimitSelection === 'none' ? '#0b0f19' : '#fff',
                    }}
                    disabled={false}
                    onClick={() => setForm((prev) => ({ ...prev, usageLimit: 'none', usageLimitSelection: 'none', usageLimitValue: '1' }))}
                  >
                    Без ограничений
                  </button>
                  <button
                    className="btn"
                    style={{
                      background: usageLimitSelection === 'per_customer' ? 'var(--brand-primary)' : 'rgba(255,255,255,.08)',
                      color: usageLimitSelection === 'per_customer' ? '#0b0f19' : '#fff',
                    }}
                    disabled={false}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        usageLimit: 'once_per_customer',
                        usageLimitSelection: 'per_customer',
                        usageLimitValue: '1',
                      }))
                    }
                  >
                    Одно использование каждому клиенту
                  </button>
                  <button
                    className="btn"
                    style={{
                      background: usageLimitSelection === 'limited' ? 'var(--brand-primary)' : 'rgba(255,255,255,.08)',
                      color: usageLimitSelection === 'limited' ? '#0b0f19' : '#fff',
                    }}
                    disabled={false}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        usageLimit: 'once_total',
                        usageLimitSelection: 'limited',
                        usageLimitValue: Number(prev.usageLimitValue || 0) > 1 ? prev.usageLimitValue : '10',
                      }))
                    }
                  >
                    Одно использование N клиентам
                  </button>
                </div>
                {usageLimitSelection === 'limited' && (
                  <div style={{ display: 'grid', gap: 6, maxWidth: 260 }}>
                    <label style={{ fontSize: 13, opacity: 0.8 }}>Сколько клиентов могут применить промокод?</label>
                    <input
                      value={form.usageLimitValue}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          usageLimitValue: e.target.value.replace(/[^0-9]/g, ''),
                        }))
                      }
                      disabled={false}
                      inputMode="numeric"
                      style={{ padding: 10, borderRadius: 8 }}
                    />
                  </div>
                )}
                {usageLimitSelection === 'per_customer' && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Каждый клиент может активировать промокод один раз.
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>
                    Период использования в днях
                    <span title="Как часто клиент может использовать промокод. По умолчанию промокоды можно использовать единожды." style={{ marginLeft: 6, border: '1px solid rgba(255,255,255,.4)', borderRadius: '50%', display: 'inline-flex', width: 16, height: 16, alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                      ?
                    </span>
                  </label>
                  <Toggle
                    checked={form.usagePeriodEnabled}
                    onChange={(value) => setForm((prev) => ({ ...prev, usagePeriodEnabled: value, usagePeriodDays: value ? (prev.usagePeriodDays || '7') : '' }))}
                    label={form.usagePeriodEnabled ? 'Включено' : 'Выключено'}
                    disabled={false}
                  />
                </div>
                {form.usagePeriodEnabled && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 13, opacity: 0.8 }}>Введите количество дней</label>
                    <input
                      value={form.usagePeriodDays}
                      onChange={(e) => setForm((prev) => ({ ...prev, usagePeriodDays: e.target.value.replace(/[^0-9]/g, '') }))}
                      disabled={false}
                      inputMode="numeric"
                      style={{ padding: 10, borderRadius: 8 }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Активен только если был визит</label>
                  <Toggle
                    checked={form.recentVisitEnabled}
                    onChange={(value) => setForm((prev) => ({ ...prev, recentVisitEnabled: value, recentVisitHours: value ? prev.recentVisitHours || '0' : '0' }))}
                    label={form.recentVisitEnabled ? 'Включено' : 'Выключено'}
                    disabled={false}
                  />
                </div>
                {form.recentVisitEnabled && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 13, opacity: 0.8 }}>Количество часов в течение которых активен промокод</label>
                    <input
                      value={form.recentVisitHours}
                      onChange={(e) => setForm((prev) => ({ ...prev, recentVisitHours: e.target.value.replace(/[^0-9]/g, '') }))}
                      disabled={false}
                      inputMode="numeric"
                      style={{ padding: 10, borderRadius: 8 }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Если указан <b>0</b>, то промокод можно использовать, если был хотя бы 1 визит.</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <DateSelector
                  label="Дата начала"
                  value={form.validFrom}
                  onChange={(value) => setForm((prev) => ({ ...prev, validFrom: value }))}
                  disabled={false}
                  defaultLabel="Сразу"
                />
                <DateSelector
                  label="Дата завершения"
                  value={form.validUntil}
                  onChange={(value) => setForm((prev) => ({ ...prev, validUntil: value }))}
                  disabled={false}
                  defaultLabel="Бессрочно"
                />
              </div>

              {formError && <div style={{ color: '#f87171' }}>{formError}</div>}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn" onClick={closeModal} disabled={submitting}>Закрыть</button>
              {modalMode !== 'view' && (
                <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Сохраняем…' : modalMode === 'create' ? 'Создать' : 'Сохранить'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

}

function mapRowToForm(row: PromocodeRow): FormState {
  const meta = row.metadata || {};
  const awardPoints = meta.awardPoints !== false;
  const points = awardPoints ? String(meta.pointsValue ?? row.value ?? 0) : '0';
  const burnEnabled = !!meta?.burn?.enabled;
  const burnDays = burnEnabled ? String(meta?.burn?.days ?? '') : '';
  const levelEnabled = !!meta?.level?.enabled;
  const levelId = levelEnabled ? String(meta?.level?.target ?? '') : '';
  const usageLimit = (meta?.usageLimit as FormState['usageLimit']) || (row.usageLimitType === 'ONCE_TOTAL' ? 'once_total' : row.usageLimitType === 'ONCE_PER_CUSTOMER' ? 'once_per_customer' : 'none');
  const rawUsageLimitValue = row.usageLimitValue ?? meta?.usageLimitValue;
  const usageLimitValue =
    usageLimit === 'once_total'
      ? String(
          Number.isFinite(Number(rawUsageLimitValue))
            ? Math.max(1, Number(rawUsageLimitValue))
            : 1,
        )
      : '1';
  const usageLimitSelection: FormState['usageLimitSelection'] =
    usageLimit === 'none'
      ? 'none'
      : usageLimit === 'once_per_customer'
        ? 'per_customer'
        : 'limited';
  const levelExpireDays = levelEnabled
    ? String(
        Number.isFinite(Number(meta?.level?.expiresInDays))
          ? Math.max(0, Number(meta?.level?.expiresInDays))
          : 0,
      )
    : '0';
  const usagePeriodEnabled = meta?.usagePeriod?.enabled ?? !!row.cooldownDays;
  const usagePeriodDays = usagePeriodEnabled
    ? String(meta?.usagePeriod?.days ?? row.cooldownDays ?? '')
    : '';
  const recentVisitEnabled =
    meta?.requireRecentVisit?.enabled ?? !!row.requireVisit;
  const recentVisitHours = String(
    meta?.requireRecentVisit?.hours ?? row.visitLookbackHours ?? 0,
  );
  return {
    code: row.code || row.name || '',
    description: row.description || '',
    awardPoints,
    points,
    burnEnabled,
    burnDays,
    levelEnabled,
    levelId,
    usageLimit,
    usageLimitSelection,
    usageLimitValue,
    levelExpireDays,
    usagePeriodEnabled,
    usagePeriodDays,
    recentVisitEnabled,
    recentVisitHours,
    validFrom: row.validFrom ? row.validFrom.slice(0, 10) : '',
    validUntil: row.validUntil ? row.validUntil.slice(0, 10) : '',
  };
}

function buildPayload(state: FormState) {
  return {
    code: state.code.trim(),
    description: state.description.trim() || undefined,
    points: Number(state.points || 0),
    awardPoints: state.awardPoints,
    burnEnabled: state.burnEnabled,
    burnDays: state.burnEnabled ? Number(state.burnDays || 0) : undefined,
    levelEnabled: state.levelEnabled,
    levelId: state.levelEnabled ? state.levelId : undefined,
    levelExpireDays:
      state.levelEnabled && Number(state.levelExpireDays || 0) > 0
        ? Number(state.levelExpireDays || 0)
        : undefined,
    usageLimit: state.usageLimit,
    usageLimitValue:
      state.usageLimit === 'once_total'
        ? Math.max(1, Number(state.usageLimitValue || 1))
        : undefined,
    usagePeriodEnabled: state.usagePeriodEnabled,
    usagePeriodDays: state.usagePeriodEnabled ? Number(state.usagePeriodDays || 0) : undefined,
    recentVisitEnabled: state.recentVisitEnabled,
    recentVisitHours: state.recentVisitEnabled ? Number(state.recentVisitHours || 0) : undefined,
    validFrom: state.validFrom || undefined,
    validUntil: state.validUntil || undefined,
  };
}

type DateSelectorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  defaultLabel: string;
};

const DateSelector: React.FC<DateSelectorProps> = ({ label, value, onChange, disabled, defaultLabel }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const displayValue = value ? new Date(value).toLocaleDateString('ru-RU') : defaultLabel;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label style={{ fontSize: 13, opacity: 0.8 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="btn"
          onClick={() => {
            if (disabled) return;
            const input = inputRef.current;
            if (!input) return;
            if (typeof (input as any).showPicker === 'function') (input as any).showPicker();
            else input.click();
          }}
          disabled={disabled}
          style={{ minWidth: 160 }}
        >
          {displayValue}
        </button>
        <button className="btn btn-ghost" onClick={() => !disabled && onChange('')} disabled={disabled}>✕</button>
      </div>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ display: 'none' }}
        disabled={disabled}
      />
    </div>
  );
};
