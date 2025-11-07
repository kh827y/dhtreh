export type RussiaTimezone = {
  code: string;
  label: string;
  city: string;
  description: string;
  mskOffset: number;
  utcOffsetMinutes: number;
  iana: string;
};

export const DEFAULT_TIMEZONE_CODE = 'MSK+4';
const MOSCOW_UTC_OFFSET_MIN = 180;

const buildTimezone = (
  code: string,
  city: string,
  description: string,
  mskOffset: number,
  iana: string,
): RussiaTimezone => {
  const utcOffsetMinutes = MOSCOW_UTC_OFFSET_MIN + mskOffset * 60;
  const utcOffsetHours = utcOffsetMinutes / 60;
  const sign =
    mskOffset === 0 ? '±0' : mskOffset > 0 ? `+${mskOffset}` : `${mskOffset}`;
  const label = `${city} (${description}, МСК${sign}, UTC${utcOffsetHours >= 0 ? '+' : ''}${utcOffsetHours})`;
  return {
    code,
    city,
    description,
    mskOffset,
    utcOffsetMinutes,
    iana,
    label,
  };
};

export const RUSSIA_TIMEZONES: RussiaTimezone[] = [
  buildTimezone(
    'MSK-1',
    'Калининград',
    'Запад России',
    -1,
    'Europe/Kaliningrad',
  ),
  buildTimezone('MSK+0', 'Москва', 'Центр России', 0, 'Europe/Moscow'),
  buildTimezone('MSK+1', 'Самара', 'Поволжье', 1, 'Europe/Samara'),
  buildTimezone('MSK+2', 'Екатеринбург', 'Урал', 2, 'Asia/Yekaterinburg'),
  buildTimezone('MSK+3', 'Омск', 'Западная Сибирь', 3, 'Asia/Omsk'),
  buildTimezone(
    'MSK+4',
    'Барнаул',
    'Алтай и Красноярский край',
    4,
    'Asia/Barnaul',
  ),
  buildTimezone('MSK+5', 'Иркутск', 'Восточная Сибирь', 5, 'Asia/Irkutsk'),
  buildTimezone('MSK+6', 'Якутск', 'Республика Саха', 6, 'Asia/Yakutsk'),
  buildTimezone('MSK+7', 'Владивосток', 'Приморье', 7, 'Asia/Vladivostok'),
  buildTimezone('MSK+8', 'Магадан', 'Колыма и Чукотка', 8, 'Asia/Magadan'),
  buildTimezone(
    'MSK+9',
    'Петропавловск-Камчатский',
    'Камчатка',
    9,
    'Asia/Kamchatka',
  ),
];

export const findTimezone = (code?: string | null): RussiaTimezone => {
  const normalized = String(code || '').toUpperCase();
  return (
    RUSSIA_TIMEZONES.find((item) => item.code === normalized) ||
    RUSSIA_TIMEZONES.find((item) => item.code === DEFAULT_TIMEZONE_CODE)!
  );
};

export const serializeTimezone = (code?: string | null) => {
  const tz = findTimezone(code);
  return {
    code: tz.code,
    label: tz.label,
    city: tz.city,
    description: tz.description,
    mskOffset: tz.mskOffset,
    utcOffsetMinutes: tz.utcOffsetMinutes,
    iana: tz.iana,
  };
};
