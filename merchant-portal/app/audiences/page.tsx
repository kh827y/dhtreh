"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
import Toggle from "../../components/Toggle";
import TagSelect from "../../components/TagSelect";
import RangeSlider from "../../components/RangeSlider";
import { Search, PlusCircle, X, Trash2, Users2 } from "lucide-react";

type TableColumn = {
  key: keyof AudienceRow | 'actions';
  label: string;
  render?: (audience: AudienceRow) => React.ReactNode;
};

const tableColumns: TableColumn[] = [
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
  { key: 'actions', label: 'Состав аудитории' },
];

type Option = { value: string; label: string };

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
  filters: Record<string, unknown>;
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
  birthday: [-30, 30],
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

const productOptions = [
  { value: 'prod-1', label: 'Лимонад' },
  { value: 'prod-2', label: 'Бургер' },
  { value: 'prod-3', label: 'Кофе' },
  { value: 'prod-4', label: 'Салат' },
];

const rfmOptions = Array.from({ length: 5 }, (_, index) => {
  const value = String(index + 1);
  return { value, label: value };
});

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

function formatDateRu(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU');
}

function parseNumber(value: unknown): number | null {
  const num = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(num) ? num : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeRfmValue(value: unknown): string {
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    if (item === null || item === undefined) continue;
    const str = String(item).trim();
    if (!str) continue;
    const num = Number(str);
    if (Number.isFinite(num) && num >= 1 && num <= 5) {
      return String(Math.round(num));
    }
  }
  return '';
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : String(item ?? '')))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseRangeInput(value: unknown): [number | null, number | null] {
  if (Array.isArray(value) && value.length >= 2) {
    return [parseNumber(value[0]), parseNumber(value[1])];
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const min =
      parseNumber(obj.min) ??
      parseNumber(obj.from) ??
      parseNumber(obj.start) ??
      parseNumber(obj.gte);
    const max =
      parseNumber(obj.max) ??
      parseNumber(obj.to) ??
      parseNumber(obj.end) ??
      parseNumber(obj.lte);
    return [min, max];
  }
  const single = parseNumber(value);
  return single !== null ? [single, single] : [null, null];
}

function normalizeRange(
  range: [number | null, number | null],
  clamp?: { min: number; max: number },
): [number | null, number | null] {
  let [min, max] = range;
  if (clamp) {
    if (min !== null) min = Math.max(clamp.min, Math.min(clamp.max, min));
    if (max !== null) max = Math.max(clamp.min, Math.min(clamp.max, max));
  }
  if (min !== null && max !== null && min > max) {
    const tmp = min;
    min = max;
    max = tmp;
  }
  return [min, max];
}

function applyRangeFallback(
  range: [number | null, number | null],
  fallback: [number, number],
): [number, number] {
  return [range[0] ?? fallback[0], range[1] ?? fallback[1]];
}

function normalizeDeviceLabel(value: string): string {
  const lower = value.toLowerCase();
  if (lower.startsWith('android')) return 'Android';
  if (lower.startsWith('ios')) return 'iOS';
  return value;
}

function settingsToFilters(s: AudienceSettings) {
  const filters: Record<string, unknown> = {};
  if (s.visitedEnabled && s.visitedOutlets.length) {
    filters.outlets = s.visitedOutlets.slice();
  }
  if (s.genderEnabled && s.gender) {
    filters.gender = [s.gender];
  }
  if (s.ageEnabled) {
    const [min, max] = s.age;
    filters.age = { min, max };
  }
  if (s.birthdayEnabled) {
    const [min, max] = s.birthday;
    filters.birthdayOffset = { min, max };
  }
  if (s.registrationEnabled) {
    const [min, max] = s.registration;
    filters.registrationDays = { min, max };
  }
  if (s.lastPurchaseEnabled) {
    const [min, max] = s.lastPurchase;
    filters.lastPurchaseDays = { min, max };
  }
  if (s.purchaseCountEnabled) {
    const [min, max] = s.purchaseCount;
    filters.purchaseCount = { min, max };
  }
  if (s.averageCheckEnabled) {
    const [min, max] = s.averageCheck;
    filters.averageCheck = { min, max };
  }
  if (s.purchaseSumEnabled) {
    const [min, max] = s.purchaseSum;
    filters.totalSpent = { min, max };
  }
  if (s.levelEnabled && s.level) {
    filters.levelIds = [s.level];
  }
  if (s.rfmRecencyEnabled && s.rfmRecency) {
    const score = Number(s.rfmRecency);
    if (Number.isFinite(score)) {
      filters.rfmRecency = Math.round(score);
    }
  }
  if (s.rfmFrequencyEnabled && s.rfmFrequency) {
    const score = Number(s.rfmFrequency);
    if (Number.isFinite(score)) {
      filters.rfmFrequency = Math.round(score);
    }
  }
  if (s.rfmMonetaryEnabled && s.rfmMonetary) {
    const score = Number(s.rfmMonetary);
    if (Number.isFinite(score)) {
      filters.rfmMonetary = Math.round(score);
    }
  }
  if (s.deviceEnabled && s.device) {
    filters.devicePlatforms = [s.device.toLowerCase()];
  }
  return filters;
}

function formatRange(
  min: number | null,
  max: number | null,
  suffix = '',
): string {
  const formatValue = (value: number) => `${value.toLocaleString('ru-RU')}${suffix}`;
  if (min !== null && max !== null) {
    if (min === max) return formatValue(min);
    return `${formatValue(min)}–${formatValue(max)}`;
  }
  if (min !== null) return `от ${formatValue(min)}`;
  if (max !== null) return `до ${formatValue(max)}`;
  return '—';
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
  } as Pick<AudienceRow, 'age' | 'gender' | 'averageCheck' | 'lastPurchaseDays' | 'purchaseCount' | 'purchaseSum' | 'birthday' | 'registrationDays' | 'device'>;

  if (!filters || typeof filters !== 'object') {
    return display;
  }

  const source = filters as Record<string, unknown>;
  const genderValues = parseStringArray(source.gender);
  if (genderValues.length === 1) {
    const value = genderValues[0].toLowerCase();
    if (value === 'male') display.gender = 'Мужской';
    else if (value === 'female') display.gender = 'Женский';
    else display.gender = 'Смешанный';
  }

  const ageRange = normalizeRange(parseRangeInput(source.age ?? source.ageRange));
  if (ageRange[0] !== null || ageRange[1] !== null) {
    display.age = formatRange(ageRange[0], ageRange[1]);
  }

  const purchaseRange = normalizeRange(
    parseRangeInput(
      source.purchaseCount ??
        source.visits ??
        (source.minVisits !== undefined || source.maxVisits !== undefined
          ? { min: source.minVisits, max: source.maxVisits }
          : undefined),
    ),
  );
  if (purchaseRange[0] !== null || purchaseRange[1] !== null) {
    display.purchaseCount = formatRange(purchaseRange[0], purchaseRange[1]);
  }

  const lastPurchaseRange = normalizeRange(
    parseRangeInput(
      source.lastPurchaseDays ??
        source.daysSinceLastPurchase ??
        (source.lastPurchase != null ? source.lastPurchase : undefined),
    ),
  );
  if (lastPurchaseRange[0] !== null || lastPurchaseRange[1] !== null) {
    display.lastPurchaseDays = formatRange(
      lastPurchaseRange[0],
      lastPurchaseRange[1],
      ' дн.',
    );
  }

  const avgCheckRange = normalizeRange(
    parseRangeInput(source.averageCheck ?? source.avgCheck),
  );
  if (avgCheckRange[0] !== null || avgCheckRange[1] !== null) {
    display.averageCheck = formatRange(
      avgCheckRange[0],
      avgCheckRange[1],
      ' ₽',
    );
  }

  const totalRange = normalizeRange(
    parseRangeInput(
      source.totalSpent ??
        source.purchaseSum ??
        (source.total !== undefined ? source.total : undefined),
    ),
  );
  if (totalRange[0] !== null || totalRange[1] !== null) {
    display.purchaseSum = formatRange(
      totalRange[0],
      totalRange[1],
      ' ₽',
    );
  }

  const birthdayRange = normalizeRange(
    parseRangeInput(
      source.birthdayOffset ?? source.birthdayWindow ?? source.birthday,
    ),
    { min: -366, max: 366 },
  );
  if (birthdayRange[0] !== null || birthdayRange[1] !== null) {
    display.birthday = formatRange(
      birthdayRange[0],
      birthdayRange[1],
      ' дн.',
    );
  }

  const registrationRange = normalizeRange(
    parseRangeInput(
      source.registrationDays ??
        source.registration ??
        (source.registrationFrom !== undefined ||
        source.registrationTo !== undefined
          ? { min: source.registrationFrom, max: source.registrationTo }
          : undefined),
    ),
  );
  if (registrationRange[0] !== null || registrationRange[1] !== null) {
    display.registrationDays = formatRange(
      registrationRange[0],
      registrationRange[1],
      ' дн.',
    );
  }

  const deviceValues = parseStringArray(
    source.devicePlatforms ?? source.device,
  );
  if (deviceValues.length === 1) {
    display.device = normalizeDeviceLabel(deviceValues[0]);
  }

  return display;
}

type MetricEntry = {
  value?: number | null;
  min?: number | null;
  max?: number | null;
};

function parseMetricEntry(value: unknown): MetricEntry | null {
  const directNumber = parseNumber(value);
  if (directNumber !== null) {
    return { value: directNumber };
  }

  if (Array.isArray(value)) {
    const numbers = value
      .map((item) => parseNumber(item))
      .filter((item): item is number => item !== null);
    if (!numbers.length) return null;
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    if (min === max) return { value: min };
    return { min, max };
  }

  const record = asRecord(value);
  if (!record) return null;

  const nestedKeys = ['metrics', 'stats', 'value', 'data'];
  for (const key of nestedKeys) {
    if (key in record) {
      const nested = parseMetricEntry(record[key]);
      if (nested) return nested;
    }
  }

  const directKeys = ['avg', 'average', 'mean', 'median', 'value', 'count', 'total', 'sum', 'amount'];
  for (const key of directKeys) {
    if (key in record) {
      const parsed = parseNumber(record[key]);
      if (parsed !== null) return { value: parsed };
    }
  }

  const min =
    parseNumber(record.min ?? record.from ?? record.start ?? record.gte ?? record.lower ?? record.low) ?? null;
  const max =
    parseNumber(record.max ?? record.to ?? record.end ?? record.lte ?? record.upper ?? record.high) ?? null;
  if (min !== null || max !== null) {
    if (min !== null && max !== null && min === max) {
      return { value: min };
    }
    return { min, max };
  }

  return null;
}

function formatMetricEntry(entry: MetricEntry | null, suffix = '', { approx = true }: { approx?: boolean } = {}) {
  if (!entry) return null;
  if (entry.value != null) {
    const formatted = `${entry.value.toLocaleString('ru-RU')}${suffix}`;
    return approx ? `≈ ${formatted}` : formatted;
  }
  if (entry.min != null || entry.max != null) {
    return formatRange(entry.min ?? null, entry.max ?? null, suffix);
  }
  return null;
}

function metricsToDisplay(snapshot: unknown) {
  const outer = asRecord(snapshot) ?? {};
  const source =
    asRecord(outer.metrics) ??
    asRecord(outer.stats) ??
    outer;

  const getEntry = (...keys: string[]) => {
    for (const key of keys) {
      if (key in source) {
        const entry = parseMetricEntry(source[key]);
        if (entry) return entry;
      }
    }
    return null;
  };

  const lastPurchaseEntry = getEntry(
    'lastPurchaseDays',
    'daysSinceLastPurchase',
    'recency',
    'recencyDays',
    'lastPurchase',
    'lastOrderDays',
  );
  const purchaseCountEntry = getEntry(
    'purchaseCount',
    'visits',
    'orders',
    'transactions',
    'checks',
  );
  const averageCheckEntry = getEntry(
    'averageCheck',
    'avgCheck',
    'meanCheck',
    'avg_order_value',
    'checkAverage',
  );
  const totalSpentEntry = getEntry(
    'purchaseSum',
    'totalSpent',
    'revenue',
    'turnover',
    'totalRevenue',
    'spend',
  );

  return {
    lastPurchaseDays: formatMetricEntry(lastPurchaseEntry, ' дн.'),
    purchaseCount: formatMetricEntry(purchaseCountEntry, '', { approx: true }),
    averageCheck: formatMetricEntry(averageCheckEntry, ' ₽'),
    purchaseSum: formatMetricEntry(totalSpentEntry, ' ₽'),
  } satisfies Partial<Pick<AudienceRow, 'lastPurchaseDays' | 'purchaseCount' | 'averageCheck' | 'purchaseSum'>>;
}

function filtersToSettings(filters: any): AudienceSettings {
  const settings: AudienceSettings = { ...defaultSettings };
  if (!filters || typeof filters !== 'object') return settings;
  const source = filters as Record<string, unknown>;

  const outlets = parseStringArray(source.outlets ?? source.visitedOutlets);
  if (outlets.length) {
    settings.visitedEnabled = true;
    settings.visitedOutlets = outlets;
  }

  const genderValues = parseStringArray(source.gender);
  if (genderValues.length === 1) {
    const value = genderValues[0].toLowerCase();
    if (value === 'male' || value === 'female') {
      settings.genderEnabled = true;
      settings.gender = value;
    }
  }

  const ageRange = applyRangeFallback(
    normalizeRange(parseRangeInput(source.age ?? source.ageRange), {
      min: 0,
      max: 100,
    }),
    defaultSettings.age,
  );
  if (ageRange[0] !== defaultSettings.age[0] || ageRange[1] !== defaultSettings.age[1]) {
    settings.ageEnabled = true;
    settings.age = ageRange;
  }

  const birthdayRange = applyRangeFallback(
    normalizeRange(
      parseRangeInput(
        source.birthdayOffset ?? source.birthdayWindow ?? source.birthday,
      ),
      { min: -30, max: 30 },
    ),
    defaultSettings.birthday,
  );
  if (
    birthdayRange[0] !== defaultSettings.birthday[0] ||
    birthdayRange[1] !== defaultSettings.birthday[1]
  ) {
    settings.birthdayEnabled = true;
    settings.birthday = birthdayRange;
  }

  const registrationRange = applyRangeFallback(
    normalizeRange(
      parseRangeInput(
        source.registrationDays ??
          source.registration ??
          (source.registrationFrom !== undefined ||
          source.registrationTo !== undefined
            ? { min: source.registrationFrom, max: source.registrationTo }
            : undefined),
      ),
      { min: 0, max: 1000 },
    ),
    defaultSettings.registration,
  );
  if (
    registrationRange[0] !== defaultSettings.registration[0] ||
    registrationRange[1] !== defaultSettings.registration[1]
  ) {
    settings.registrationEnabled = true;
    settings.registration = registrationRange;
  }

  const lastPurchaseRange = applyRangeFallback(
    normalizeRange(
      parseRangeInput(
        source.lastPurchaseDays ??
          source.daysSinceLastPurchase ??
          (source.lastPurchase != null ? source.lastPurchase : undefined),
      ),
      { min: 0, max: 365 },
    ),
    defaultSettings.lastPurchase,
  );
  if (
    lastPurchaseRange[0] !== defaultSettings.lastPurchase[0] ||
    lastPurchaseRange[1] !== defaultSettings.lastPurchase[1]
  ) {
    settings.lastPurchaseEnabled = true;
    settings.lastPurchase = lastPurchaseRange;
  }

  const purchaseCountRange = applyRangeFallback(
    normalizeRange(
      parseRangeInput(
        source.purchaseCount ??
          source.visits ??
          (source.minVisits !== undefined || source.maxVisits !== undefined
            ? { min: source.minVisits, max: source.maxVisits }
            : undefined),
      ),
      { min: 0, max: 1000 },
    ),
    defaultSettings.purchaseCount,
  );
  if (
    purchaseCountRange[0] !== defaultSettings.purchaseCount[0] ||
    purchaseCountRange[1] !== defaultSettings.purchaseCount[1]
  ) {
    settings.purchaseCountEnabled = true;
    settings.purchaseCount = purchaseCountRange;
  }

  const averageCheckRange = applyRangeFallback(
    normalizeRange(parseRangeInput(source.averageCheck ?? source.avgCheck)),
    defaultSettings.averageCheck,
  );
  if (
    averageCheckRange[0] !== defaultSettings.averageCheck[0] ||
    averageCheckRange[1] !== defaultSettings.averageCheck[1]
  ) {
    settings.averageCheckEnabled = true;
    settings.averageCheck = averageCheckRange;
  }

  const totalSpentRange = applyRangeFallback(
    normalizeRange(
      parseRangeInput(
        source.totalSpent ??
          source.purchaseSum ??
          (source.total !== undefined ? source.total : undefined),
      ),
    ),
    defaultSettings.purchaseSum,
  );
  if (
    totalSpentRange[0] !== defaultSettings.purchaseSum[0] ||
    totalSpentRange[1] !== defaultSettings.purchaseSum[1]
  ) {
    settings.purchaseSumEnabled = true;
    settings.purchaseSum = totalSpentRange;
  }

  const levelValues = parseStringArray(
    source.levelIds ??
      source.levels ??
      (typeof source.level === 'string' ? [source.level] : undefined),
  );
  if (levelValues.length === 1) {
    settings.levelEnabled = true;
    settings.level = levelValues[0];
  }

  const deviceValues = parseStringArray(
    source.devicePlatforms ?? source.device,
  );
  if (deviceValues.length === 1) {
    settings.deviceEnabled = true;
    settings.device = normalizeDeviceLabel(deviceValues[0]);
  }

  const recencyValue = normalizeRfmValue(
    source.rfmRecency ??
      source.rfmRecencyScores ??
      source.rfmRecencyGroup ??
      source.rfmR,
  );
  if (recencyValue) {
    settings.rfmRecencyEnabled = true;
    settings.rfmRecency = recencyValue;
  }

  const frequencyValue = normalizeRfmValue(
    source.rfmFrequency ?? source.rfmFrequencyScores ?? source.rfmF,
  );
  if (frequencyValue) {
    settings.rfmFrequencyEnabled = true;
    settings.rfmFrequency = frequencyValue;
  }

  const monetaryValue = normalizeRfmValue(
    source.rfmMonetary ?? source.rfmMonetaryScores ?? source.rfmM,
  );
  if (monetaryValue) {
    settings.rfmMonetaryEnabled = true;
    settings.rfmMonetary = monetaryValue;
  }

  return settings;
}

function segmentToAudienceRow(seg: any): AudienceRow {
  const filters =
    seg.filters && typeof seg.filters === 'object' && !Array.isArray(seg.filters)
      ? (seg.filters as Record<string, unknown>)
      : {};
  const display = filtersToDisplay(filters);
  const metricsDisplay = metricsToDisplay(seg?.metricsSnapshot);
  return {
    id: String(seg.id),
    name: String(seg.name || 'Без названия'),
    participants: Number(seg.customerCount || 0),
    age: display.age,
    gender: display.gender,
    averageCheck: metricsDisplay.averageCheck ?? display.averageCheck,
    lastPurchaseDays: metricsDisplay.lastPurchaseDays ?? display.lastPurchaseDays,
    purchaseCount: metricsDisplay.purchaseCount ?? display.purchaseCount,
    purchaseSum: metricsDisplay.purchaseSum ?? display.purchaseSum,
    birthday: display.birthday,
    registrationDays: display.registrationDays,
    device: display.device,
    settings: filtersToSettings(filters),
    filters,
  };
}

function mapMember(row: any): AudienceMember {
  const birthday = row?.birthday ? String(row.birthday) : '';
  return {
    id: String(row.id || ''),
    phone: String(row.phone || ''),
    name: String(row.name || row.phone || row.id || ''),
    birthday,
    age: birthday ? calculateAge(birthday) : 0,
    registrationDate: String(row.createdAt || ''),
  };
}

// no sample data: always load from API

export default function AudiencesPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [audiences, setAudiences] = React.useState<AudienceRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [modalMode, setModalMode] = React.useState<'create' | 'edit' | null>(null);
  const [currentAudience, setCurrentAudience] = React.useState<AudienceRow | null>(null);
  const [settings, setSettings] = React.useState<AudienceSettings>(defaultSettings);
  const [audienceName, setAudienceName] = React.useState('');
  const [memberSearch, setMemberSearch] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [membersModalAudience, setMembersModalAudience] = React.useState<AudienceRow | null>(null);
  const [membersModalMembers, setMembersModalMembers] = React.useState<AudienceMember[]>([]);
  const [outletOptions, setOutletOptions] = React.useState<Option[]>([]);
  const [levelOptions, setLevelOptions] = React.useState<Option[]>([]);

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

  React.useEffect(() => {
    (async () => {
      try {
        const res = await api<any>(`/api/portal/outlets?status=ACTIVE`);
        const list = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res)
            ? res
            : [];
        setOutletOptions(
          list.map((outlet: any) => ({
            value: String(outlet.id ?? ''),
            label: String(outlet.name || outlet.id || ''),
          })),
        );
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await api<any>(`/api/portal/loyalty/tiers`);
        const list = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res)
            ? res
            : [];
        setLevelOptions(
          list.map((tier: any) => ({
            value: String(tier.id ?? ''),
            label: String(tier.name || tier.id || ''),
          })),
        );
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Load members when opening members tab
  // members modal loads data on open; see openMembersModal

  const openMembersModal = (
    audience: AudienceRow,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event?.stopPropagation();
    setMembersModalAudience(audience);
    setMemberSearch('');
    setMembersModalMembers([]);
    setMembersLoading(true);
    (async () => {
      try {
        const qs = new URLSearchParams({ segmentId: audience.id, limit: '100' });
        const res = await api<any>(`/api/customers?${qs.toString()}`);
        const items = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res)
            ? res
            : [];
        setMembersModalMembers(items.map(mapMember));
      } catch (e) {
        console.error(e);
        setMembersModalMembers([]);
      } finally {
        setMembersLoading(false);
      }
    })();
  };

  const closeMembersModal = () => {
    setMembersModalAudience(null);
    setMembersModalMembers([]);
    setMemberSearch('');
    setMembersLoading(false);
  };

  const handleMemberClick = (member: AudienceMember) => {
    closeMembersModal();
    router.push(`/customers/${member.id}`);
  };

  const filteredMembers = React.useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    if (!term) return membersModalMembers;
    return membersModalMembers.filter(
      (member) =>
        member.phone.toLowerCase().includes(term) ||
        member.name.toLowerCase().includes(term),
    );
  }, [membersModalMembers, memberSearch]);

  const filtered = React.useMemo(() =>
    audiences.filter((aud) => aud.name.toLowerCase().includes(search.toLowerCase())),
  [audiences, search]);

  const openCreate = () => {
    setModalMode('create');
    setAudienceName('');
    setSettings(defaultSettings);
    setCurrentAudience(null);
  };

  const openEdit = (audience: AudienceRow) => {
    setModalMode('edit');
    setAudienceName(audience.name);
    setSettings(audience.settings);
    setCurrentAudience(audience);
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
                    <tr
                      key={aud.id}
                      onClick={() => openEdit(aud)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,0.1)' }}
                    >
                      {tableColumns.map((col) => {
                        const isName = col.key === 'name';
                        const cellStyle: React.CSSProperties = {
                          padding: '12px 12px',
                          ...(isName ? { fontWeight: 600 } : {}),
                        };
                        let value: React.ReactNode;
                        if (col.key === 'actions') {
                          value = (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(event) => openMembersModal(aud, event)}
                              startIcon={<Users2 size={16} />}
                            >
                              Открыть
                            </Button>
                          );
                        } else {
                          value = aud[col.key as keyof AudienceRow] ?? '—';
                        }
                        return (
                          <td key={col.key as string} style={cellStyle}>
                            {value}
                          </td>
                        );
                      })}
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

        {membersModalAudience && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,0.74)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              zIndex: 95,
            }}
          >
            <div
              style={{
                width: 'min(720px, 96vw)',
                maxHeight: '94vh',
                overflow: 'hidden',
                background: 'rgba(12,16,26,0.96)',
                borderRadius: 22,
                border: '1px solid rgba(148,163,184,0.16)',
                boxShadow: '0 28px 80px rgba(2,6,23,0.5)',
                display: 'grid',
                gridTemplateRows: 'auto 1fr',
              }}
            >
              <div
                style={{
                  padding: '18px 24px',
                  borderBottom: '1px solid rgba(148,163,184,0.16)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{membersModalAudience.name}</div>
                  <div style={{ fontSize: 13, opacity: 0.65 }}>
                    {membersModalAudience.participants} участников
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={closeMembersModal}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: 24, display: 'grid', gap: 16 }}>
                <div style={{ position: 'relative' }}>
                  <input
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Поиск по телефону или имени"
                    style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 10 }}
                  />
                  <Search
                    size={16}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      opacity: 0.6,
                    }}
                  />
                </div>

                {membersLoading ? (
                  <Skeleton height={220} />
                ) : filteredMembers.length ? (
                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      maxHeight: '52vh',
                      overflowY: 'auto',
                      paddingRight: 4,
                    }}
                  >
                    {filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => handleMemberClick(member)}
                        className="btn btn-ghost"
                        style={{
                          justifyContent: 'space-between',
                          textAlign: 'left',
                          padding: '12px 16px',
                          borderRadius: 14,
                          border: '1px solid rgba(148,163,184,0.18)',
                        }}
                      >
                        <div style={{ display: 'grid', gap: 4 }}>
                          <div style={{ fontWeight: 600 }}>{member.name || member.phone}</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {member.phone}
                            {member.age ? ` • ${member.age} лет` : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.6 }}>
                          Зарегистрирован: {formatDateRu(member.registrationDate)}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 12, opacity: 0.7 }}>Участники не найдены</div>
                )}
              </div>
            </div>
          </div>
        )}

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

              <SettingsForm
                settings={settings}
                onChange={setSettings}
                outletOptions={outletOptions}
                levelOptions={levelOptions}
              />
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
  outletOptions: Option[];
  levelOptions: Option[];
};

const SettingsForm: React.FC<SettingsFormProps> = ({
  settings,
  onChange,
  outletOptions,
  levelOptions,
}) => {
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
        <RangeSlider min={-30} max={30} value={settings.birthday} onChange={(value) => update({ birthday: value })} />
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
