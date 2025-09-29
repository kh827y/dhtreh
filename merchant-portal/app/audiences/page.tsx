"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
import Toggle from "../../components/Toggle";
import TagSelect from "../../components/TagSelect";
import RangeSlider from "../../components/RangeSlider";
import { Search, PlusCircle, X, Trash2, Users2 } from "lucide-react";

const tableColumns = [
  { key: 'name', label: 'Название' },
  { key: 'participants', label: 'Участники' },
  { key: 'age', label: 'Возраст' },
  { key: 'gender', label: 'Пол' },
  { key: 'averageCheck', label: 'Средний чек' },
  { key: 'lastPurchaseDays', label: 'Дней с последней покупки' },
  { key: 'purchaseCount', label: 'Количество покупок' },
  { key: 'purchaseSum', label: 'Сумма покупок' },
  { key: 'birthday', label: 'День рождения' },
  { key: 'registrationDays', label: 'Дней с момента регистрации' },
  { key: 'device', label: 'Устройство' },
] as const;

type AudienceRow = {
  id: string;
  name: string;
  participants: number;
  age: string;
  gender: string;
  averageCheck: string;
  lastPurchaseDays: string;
  purchaseCount: string;
  purchaseSum: string;
  birthday: string;
  registrationDays: string;
  device: string;
  settings: AudienceSettings;
  members: AudienceMember[];
};

type AudienceMember = {
  id: string;
  phone: string;
  name: string;
  birthday: string;
  age: number;
  registrationDate: string;
};

type AudienceSettings = {
  visitedEnabled: boolean;
  visitedOutlets: string[];
  productEnabled: boolean;
  products: string[];
  genderEnabled: boolean;
  gender: 'male' | 'female' | '';
  ageEnabled: boolean;
  age: [number, number];
  birthdayEnabled: boolean;
  birthday: [number, number];
  registrationEnabled: boolean;
  registration: [number, number];
  lastPurchaseEnabled: boolean;
  lastPurchase: [number, number];
  purchaseCountEnabled: boolean;
  purchaseCount: [number, number];
  averageCheckEnabled: boolean;
  averageCheck: [number, number];
  purchaseSumEnabled: boolean;
  purchaseSum: [number, number];
  levelEnabled: boolean;
  level: string;
  rfmRecencyEnabled: boolean;
  rfmRecency: string;
  rfmFrequencyEnabled: boolean;
  rfmFrequency: string;
  rfmMonetaryEnabled: boolean;
  rfmMonetary: string;
  deviceEnabled: boolean;
  device: string;
};

const defaultSettings: AudienceSettings = {
  visitedEnabled: false,
  visitedOutlets: [],
  productEnabled: false,
  products: [],
  genderEnabled: false,
  gender: '',
  ageEnabled: false,
  age: [0, 100],
  birthdayEnabled: false,
  birthday: [0, 365],
  registrationEnabled: false,
  registration: [0, 365],
  lastPurchaseEnabled: false,
  lastPurchase: [0, 365],
  purchaseCountEnabled: false,
  purchaseCount: [0, 1000],
  averageCheckEnabled: false,
  averageCheck: [0, 10000],
  purchaseSumEnabled: false,
  purchaseSum: [0, 200000],
  levelEnabled: false,
  level: '',
  rfmRecencyEnabled: false,
  rfmRecency: '',
  rfmFrequencyEnabled: false,
  rfmFrequency: '',
  rfmMonetaryEnabled: false,
  rfmMonetary: '',
  deviceEnabled: false,
  device: '',
};

const outletOptions = [
  { value: 'outlet-1', label: 'Точка на Тверской' },
  { value: 'outlet-2', label: 'ТРЦ Авиапарк' },
  { value: 'outlet-3', label: 'МЕГА Химки' },
  { value: 'outlet-4', label: 'Онлайн' },
];

const productOptions = [
  { value: 'prod-1', label: 'Лимонад' },
  { value: 'prod-2', label: 'Бургер' },
  { value: 'prod-3', label: 'Кофе' },
  { value: 'prod-4', label: 'Салат' },
];

const levelOptions = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
];

const rfmOptions = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' },
];

// API helper
async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  try { return text ? JSON.parse(text) as T : (undefined as unknown as T); } catch { return (undefined as unknown as T); }
}

function calculateAge(birthday: string): number {
  try {
    const d = new Date(birthday);
    if (Number.isNaN(d.getTime())) return 0;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
    return age;
  } catch { return 0; }
}

function settingsToFilters(s: AudienceSettings) {
  const filters: any = {};
  if (s.genderEnabled && s.gender) filters.gender = [s.gender];
  if (s.purchaseCountEnabled) {
    filters.minVisits = s.purchaseCount?.[0];
    filters.maxVisits = s.purchaseCount?.[1];
  }
  if (s.rfmRecencyEnabled && s.rfmRecency) filters.rfmClasses = [s.rfmRecency];
  if (s.rfmFrequencyEnabled && s.rfmFrequency) filters.rfmClasses = [...(filters.rfmClasses || []), s.rfmFrequency];
  if (s.rfmMonetaryEnabled && s.rfmMonetary) filters.rfmClasses = [...(filters.rfmClasses || []), s.rfmMonetary];
  if (s.lastPurchaseEnabled) {
    const now = new Date();
    const from = new Date(now.getTime() - (s.lastPurchase?.[1] ?? 0) * 24 * 3600 * 1000);
    const to = new Date(now.getTime() - (s.lastPurchase?.[0] ?? 0) * 24 * 3600 * 1000);
    filters.lastVisitFrom = from.toISOString();
    filters.lastVisitTo = to.toISOString();
  }
  // tags/level/device/birthday/age/products/outlets можно хранить в rules
  return filters;
}

function filtersToDisplay(filters: any) {
  const display = {
    age: '—',
    gender: 'Смешанный',
    averageCheck: '—',
    lastPurchaseDays: '—',
    purchaseCount: '—',
    purchaseSum: '—',
    birthday: '—',
    registrationDays: '—',
    device: '—',
  } as Pick<AudienceRow, 'age'|'gender'|'averageCheck'|'lastPurchaseDays'|'purchaseCount'|'purchaseSum'|'birthday'|'registrationDays'|'device'>;
  if (Array.isArray(filters?.gender) && filters.gender.length === 1) display.gender = filters.gender[0] === 'male' ? 'Мужской' : filters.gender[0] === 'female' ? 'Женский' : 'Смешанный';
  if (filters?.minVisits != null || filters?.maxVisits != null) display.purchaseCount = `${filters.minVisits ?? 0}-${filters.maxVisits ?? '∞'}`;
  if (filters?.lastVisitFrom || filters?.lastVisitTo) display.lastPurchaseDays = 'по периоду';
  return display;
}

function segmentToAudienceRow(seg: any): AudienceRow {
  const filters = seg.filters || {};
  const d = filtersToDisplay(filters);
  return {
    id: String(seg.id),
    name: String(seg.name || 'Без названия'),
    participants: Number(seg.customerCount || 0),
    age: d.age,
    gender: d.gender,
    averageCheck: d.averageCheck,
    lastPurchaseDays: d.lastPurchaseDays,
    purchaseCount: d.purchaseCount,
    purchaseSum: d.purchaseSum,
    birthday: d.birthday,
    registrationDays: d.registrationDays,
    device: d.device,
    settings: defaultSettings,
    members: [],
  };
}

function mapMember(row: any): AudienceMember {
  return {
    id: String(row.id || ''),
    phone: String(row.phone || ''),
    name: String(row.name || row.phone || row.id || ''),
    birthday: row.birthday ? String(row.birthday) : '',
    age: row.birthday ? calculateAge(String(row.birthday)) : 0,
    registrationDate: String(row.createdAt || ''),
  };
}

// no sample data: always load from API

export default function AudiencesPage() {
  const [search, setSearch] = React.useState('');
  const [audiences, setAudiences] = React.useState<AudienceRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [modalMode, setModalMode] = React.useState<'create' | 'edit' | null>(null);
  const [currentAudience, setCurrentAudience] = React.useState<AudienceRow | null>(null);
  const [settings, setSettings] = React.useState<AudienceSettings>(defaultSettings);
  const [audienceName, setAudienceName] = React.useState('');
  const [tab, setTab] = React.useState<'settings' | 'members'>('settings');
  const [memberSearch, setMemberSearch] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [membersLoading, setMembersLoading] = React.useState(false);

  const loadAudiences = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<any[]>(`/api/portal/audiences`);
      const rows = Array.isArray(list) ? list.map(segmentToAudienceRow) : [];
      setAudiences(rows);
    } catch (e) {
      console.error(e);
      setAudiences([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadAudiences(); }, [loadAudiences]);

  // Load members when opening members tab
  React.useEffect(() => {
    const id = currentAudience?.id;
    if (!id) return;
    if (tab !== 'members') return;
    setMembersLoading(true);
    (async () => {
      try {
        const qs = new URLSearchParams({ segmentId: id, limit: '100' });
        const res = await api<any>(`/api/customers?${qs.toString()}`);
        const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
        const mapped = items.map(mapMember);
        setCurrentAudience((prev) => (prev && prev.id === id ? { ...prev, members: mapped } : prev));
      } catch (e) { console.error(e); }
      finally { setMembersLoading(false); }
    })();
  }, [tab, currentAudience?.id]);

  const filtered = React.useMemo(() =>
    audiences.filter((aud) => aud.name.toLowerCase().includes(search.toLowerCase())),
  [audiences, search]);

  const openCreate = () => {
    setModalMode('create');
    setAudienceName('');
    setSettings(defaultSettings);
    setCurrentAudience(null);
    setTab('settings');
  };

  const openEdit = (audience: AudienceRow) => {
    setModalMode('edit');
    setAudienceName(audience.name);
    setSettings(audience.settings);
    setCurrentAudience(audience);
    setTab('settings');
  };

  const closeModal = () => {
    setModalMode(null);
    setAudienceName('');
    setSettings(defaultSettings);
    setCurrentAudience(null);
    setMemberSearch('');
  };

  const handleSubmit = async () => {
    if (!audienceName.trim()) {
      alert('Укажите название аудитории');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: audienceName.trim(), rules: { ui: 'audience-settings' }, filters: settingsToFilters(settings) };
      if (modalMode === 'create') {
        await api(`/api/portal/audiences`, { method: 'POST', body: JSON.stringify(payload) });
      } else if (modalMode === 'edit' && currentAudience) {
        await api(`/api/portal/audiences/${encodeURIComponent(currentAudience.id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      }
      await loadAudiences();
      closeModal();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentAudience) return;
    if (!confirm('Удалить аудиторию?')) return;
    try {
      await api(`/api/portal/audiences/${encodeURIComponent(currentAudience.id)}/archive`, { method: 'POST', body: JSON.stringify({}) });
      await loadAudiences();
      closeModal();
    } catch (e) { console.error(e); }
  };

  const filteredMembers = React.useMemo(() => {
    if (!currentAudience) return [] as AudienceMember[];
    const term = memberSearch.trim().toLowerCase();
    if (!term) return currentAudience.members;
    return currentAudience.members.filter((m) =>
      m.phone.toLowerCase().includes(term) ||
      m.name.toLowerCase().includes(term),
    );
  }, [currentAudience, memberSearch]);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Аудитории клиентов</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Сегментируйте клиентов по поведению и характеристикам</div>
        </div>
        <Button variant="primary" onClick={openCreate} startIcon={<PlusCircle size={18} />}>Создать аудиторию</Button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 1 320px' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 10 }}
          />
          <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }} />
        </div>
      </div>

      <Card>
        <CardHeader title="Аудитории" subtitle={`${filtered.length} записей`} />
        <CardBody>
          {loading ? (
            <Skeleton height={220} />
          ) : filtered.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                <thead>
                  <tr>
                    {tableColumns.map((col) => (
                      <th key={col.key as string} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, opacity: 0.65, letterSpacing: 0.4, textTransform: 'uppercase', borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((aud) => (
                    <tr key={aud.id} onClick={() => openEdit(aud)} style={{ cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
                      <td style={{ padding: '12px 12px', fontWeight: 600 }}>{aud.name}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.participants}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.age}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.gender}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.averageCheck}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.lastPurchaseDays}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.purchaseCount}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.purchaseSum}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.birthday}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.registrationDays}</td>
                      <td style={{ padding: '12px 12px' }}>{aud.device}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 16, opacity: 0.7 }}>Аудитории не найдены</div>
          )}
        </CardBody>
      </Card>

      {modalMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.74)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 90 }}>
          <div style={{ width: 'min(960px, 96vw)', maxHeight: '94vh', overflow: 'auto', background: 'rgba(12,16,26,0.96)', borderRadius: 22, border: '1px solid rgba(148,163,184,0.16)', boxShadow: '0 28px 80px rgba(2,6,23,0.5)', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(148,163,184,0.16)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{modalMode === 'create' ? 'Создать аудиторию' : audienceName}</div>
                <div style={{ fontSize: 13, opacity: 0.65 }}>{modalMode === 'create' ? 'Настройте фильтры и сохраните аудиторию' : `${currentAudience?.participants ?? 0} участников`}</div>
              </div>
              <button className="btn btn-ghost" onClick={closeModal}><X size={18} /></button>
            </div>

            <div style={{ padding: 24, display: 'grid', gap: 20 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Название *</label>
                <input value={audienceName} onChange={(e) => setAudienceName(e.target.value)} placeholder="Например, Лояльные" style={{ padding: 12, borderRadius: 10 }} />
              </div>

              {modalMode === 'edit' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className={tab === 'settings' ? 'btn btn-primary' : 'btn'} onClick={() => setTab('settings')}>Настройки</button>
                  <button className={tab === 'members' ? 'btn btn-primary' : 'btn'} onClick={() => setTab('members')}>Состав аудитории</button>
                </div>
              )}

              {tab === 'settings' && (
                <SettingsForm settings={settings} onChange={setSettings} />
              )}

              {tab === 'members' && currentAudience && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ position: 'relative', maxWidth: 320 }}>
                    <input
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Поиск по телефону или имени"
                      style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 10 }}
                    />
                    <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }} />
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(148,163,184,0.08)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>№</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Телефон</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Имя</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>День рождения</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Возраст</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Дата регистрации</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMembers.map((member, index) => (
                          <tr key={member.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
                            <td style={{ padding: '8px 12px' }}>{index + 1}</td>
                            <td style={{ padding: '8px 12px' }}>{member.phone}</td>
                            <td style={{ padding: '8px 12px' }}>{member.name}</td>
                            <td style={{ padding: '8px 12px' }}>{new Date(member.birthday).toLocaleDateString('ru-RU')}</td>
                            <td style={{ padding: '8px 12px' }}>{member.age}</td>
                            <td style={{ padding: '8px 12px' }}>{new Date(member.registrationDate).toLocaleDateString('ru-RU')}</td>
                          </tr>
                        ))}
                        {!filteredMembers.length && (
                          <tr>
                            <td colSpan={6} style={{ padding: 16, textAlign: 'center', opacity: 0.6 }}>Совпадения не найдены</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(148,163,184,0.16)', display: 'flex', justifyContent: modalMode === 'edit' ? 'space-between' : 'flex-end', gap: 12 }}>
              {modalMode === 'edit' && currentAudience && (
                <Button variant="danger" startIcon={<Trash2 size={16} />} onClick={handleDelete}>Удалить аудиторию</Button>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn" onClick={closeModal} disabled={saving}>Отмена</button>
                <Button variant="primary" onClick={handleSubmit} disabled={saving} startIcon={<Users2 size={16} />}>
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type SettingsFormProps = {
  settings: AudienceSettings;
  onChange: (next: AudienceSettings) => void;
};

const SettingsForm: React.FC<SettingsFormProps> = ({ settings, onChange }) => {
  const update = (patch: Partial<AudienceSettings>) => onChange({ ...settings, ...patch });

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <ToggleRow
        title="Посещал точку"
        enabled={settings.visitedEnabled}
        onToggle={(value) => update({ visitedEnabled: value })}
      >
        <TagSelect
          options={outletOptions}
          value={settings.visitedOutlets}
          onChange={(value) => update({ visitedOutlets: value })}
          placeholder="Выберите торговые точки"
        />
      </ToggleRow>

      <ToggleRow
        title="Покупал товар"
        enabled={settings.productEnabled}
        onToggle={(value) => update({ productEnabled: value })}
      >
        <TagSelect
          options={productOptions}
          value={settings.products}
          onChange={(value) => update({ products: value })}
          placeholder="Выберите товары"
        />
      </ToggleRow>

      <ToggleRow
        title="Пол"
        enabled={settings.genderEnabled}
        onToggle={(value) => update({ genderEnabled: value })}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={settings.gender === 'male' ? 'btn btn-primary' : 'btn'} onClick={() => update({ gender: 'male' })}>Мужской</button>
          <button className={settings.gender === 'female' ? 'btn btn-primary' : 'btn'} onClick={() => update({ gender: 'female' })}>Женский</button>
        </div>
      </ToggleRow>

      <ToggleRow
        title="Возраст"
        enabled={settings.ageEnabled}
        onToggle={(value) => update({ ageEnabled: value })}
      >
        <RangeSlider min={0} max={100} value={settings.age} onChange={(value) => update({ age: value })} />
      </ToggleRow>

      <ToggleRow
        title="День рождения"
        enabled={settings.birthdayEnabled}
        onToggle={(value) => update({ birthdayEnabled: value })}
      >
        <RangeSlider min={0} max={365} value={settings.birthday} onChange={(value) => update({ birthday: value })} />
      </ToggleRow>

      <ToggleRow
        title="Дней с момента регистрации"
        enabled={settings.registrationEnabled}
        onToggle={(value) => update({ registrationEnabled: value })}
      >
        <RangeSlider min={0} max={1000} value={settings.registration} onChange={(value) => update({ registration: value })} />
      </ToggleRow>

      <ToggleRow
        title="Дней с последней покупки"
        enabled={settings.lastPurchaseEnabled}
        onToggle={(value) => update({ lastPurchaseEnabled: value })}
      >
        <RangeSlider min={0} max={365} value={settings.lastPurchase} onChange={(value) => update({ lastPurchase: value })} />
      </ToggleRow>

      <ToggleRow
        title="Количество покупок"
        enabled={settings.purchaseCountEnabled}
        onToggle={(value) => update({ purchaseCountEnabled: value })}
      >
        <RangeSlider min={0} max={1000} value={settings.purchaseCount} onChange={(value) => update({ purchaseCount: value })} />
      </ToggleRow>

      <ToggleRow
        title="Средний чек"
        enabled={settings.averageCheckEnabled}
        onToggle={(value) => update({ averageCheckEnabled: value })}
      >
        <DualInputRange value={settings.averageCheck} onChange={(value) => update({ averageCheck: value })} prefix="₽" />
      </ToggleRow>

      <ToggleRow
        title="Сумма покупок"
        enabled={settings.purchaseSumEnabled}
        onToggle={(value) => update({ purchaseSumEnabled: value })}
      >
        <DualInputRange value={settings.purchaseSum} onChange={(value) => update({ purchaseSum: value })} prefix="₽" />
      </ToggleRow>

      <ToggleRow
        title="Уровень клиента"
        enabled={settings.levelEnabled}
        onToggle={(value) => update({ levelEnabled: value })}
      >
        <TagSelect options={levelOptions} value={settings.level ? [settings.level] : []} onChange={(value) => update({ level: value[0] || '' })} allowMultiple={false} placeholder="Выберите уровень" />
      </ToggleRow>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <ToggleRow title="RFM Давность" enabled={settings.rfmRecencyEnabled} onToggle={(value) => update({ rfmRecencyEnabled: value })}>
          <TagSelect options={rfmOptions} value={settings.rfmRecency ? [settings.rfmRecency] : []} onChange={(value) => update({ rfmRecency: value[0] || '' })} allowMultiple={false} placeholder="Выберите" />
        </ToggleRow>
        <ToggleRow title="RFM Частота" enabled={settings.rfmFrequencyEnabled} onToggle={(value) => update({ rfmFrequencyEnabled: value })}>
          <TagSelect options={rfmOptions} value={settings.rfmFrequency ? [settings.rfmFrequency] : []} onChange={(value) => update({ rfmFrequency: value[0] || '' })} allowMultiple={false} placeholder="Выберите" />
        </ToggleRow>
        <ToggleRow title="RFM Деньги" enabled={settings.rfmMonetaryEnabled} onToggle={(value) => update({ rfmMonetaryEnabled: value })}>
          <TagSelect options={rfmOptions} value={settings.rfmMonetary ? [settings.rfmMonetary] : []} onChange={(value) => update({ rfmMonetary: value[0] || '' })} allowMultiple={false} placeholder="Выберите" />
        </ToggleRow>
      </div>

      <ToggleRow
        title="Устройство"
        enabled={settings.deviceEnabled}
        onToggle={(value) => update({ deviceEnabled: value })}
      >
        <TagSelect
          options={[{ value: 'Android', label: 'Android' }, { value: 'iOS', label: 'iOS' }]}
          value={settings.device ? [settings.device] : []}
          onChange={(value) => update({ device: value[0] || '' })}
          allowMultiple={false}
          placeholder="Выберите платформу"
        />
      </ToggleRow>
    </div>
  );
};

type ToggleRowProps = {
  title: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  children: React.ReactNode;
};

const ToggleRow: React.FC<ToggleRowProps> = ({ title, enabled, onToggle, children }) => (
  <div style={{
    border: '1px solid rgba(148,163,184,0.18)',
    borderRadius: 16,
    padding: 16,
    background: 'rgba(148,163,184,0.06)',
    display: 'grid',
    gap: 12,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
      <Toggle checked={enabled} onChange={onToggle} label={enabled ? 'Вкл' : 'Выкл'} />
    </div>
    {enabled && <div>{children}</div>}
  </div>
);

type DualInputRangeProps = {
  value: [number, number];
  onChange: (value: [number, number]) => void;
  prefix?: string;
};

const DualInputRange: React.FC<DualInputRangeProps> = ({ value, onChange, prefix }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
    <span style={{ opacity: 0.7 }}>От</span>
    <input value={value[0]} onChange={(e) => onChange([Number(e.target.value || 0), value[1]])} style={{ padding: 10, borderRadius: 10, width: 120 }} />
    <span style={{ opacity: 0.7 }}>до</span>
    <input value={value[1]} onChange={(e) => onChange([value[0], Number(e.target.value || 0)])} style={{ padding: 10, borderRadius: 10, width: 120 }} />
    {prefix && <span style={{ opacity: 0.7 }}>{prefix}</span>}
  </div>
);
