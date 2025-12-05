export type SummaryTimelinePoint = {
  date: string;
  registrations: number;
  salesCount: number;
  salesAmount: number;
};

export type SummaryMetrics = {
  salesAmount: number;
  averageCheck: number;
  newCustomers: number;
  activeCustomers: number;
  averagePurchasesPerCustomer: number;
  visitFrequencyDays: number | null;
};

export type DashboardResponse = {
  period: { from: string; to: string; type: string };
  metrics: SummaryMetrics;
  timeline: SummaryTimelinePoint[];
};

export function formatNumber(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function formatDecimal(value?: number | null, fractionDigits = 1): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDayLabel(date: string) {
  if (!date || date.length < 10) return date;
  const [, month, day] = date.split("-");
  return `${day}.${month}` || date;
}

export function hasTimelineData(timeline: SummaryTimelinePoint[]): boolean {
  return timeline.some(
    (point) =>
      (point.registrations ?? 0) > 0 ||
      (point.salesAmount ?? 0) > 0 ||
      (point.salesCount ?? 0) > 0,
  );
}

export function buildChartOption(timeline: SummaryTimelinePoint[]) {
  if (!timeline.length) {
    return {
      grid: { left: 32, right: 80, top: 32, bottom: 48 },
      xAxis: { type: "category", data: [], axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } } },
      yAxis: [],
      series: [],
    } as const;
  }

  const labels = timeline.map((point) => formatDayLabel(point.date));
  const registrations = timeline.map((point) => point.registrations);
  const salesCount = timeline.map((point) => point.salesCount);
  const salesAmount = timeline.map((point) => point.salesAmount);
  const scaleMax = (values: number[], ratio: number) => {
    const max = Math.max(...values, 0);
    if (max <= 0) return undefined;
    return Math.max(1, Math.ceil(max / ratio));
  };
  const registrationsMax = scaleMax(registrations, 0.4);
  const salesCountMax = scaleMax(salesCount, 0.7);
  const salesAmountMax = scaleMax(salesAmount, 1);

  return {
    tooltip: { trigger: "axis" },
    legend: {
      data: ["Регистрации", "Продажи", "Сумма продаж"],
      textStyle: { color: "#cbd5f5" },
    },
    grid: { left: 32, right: 96, top: 32, bottom: 48 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: labels,
      axisLabel: { color: "#cbd5f5" },
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } },
    },
    yAxis: [
      {
        type: "value",
        position: "left",
        axisLabel: { show: false },
        splitLine: { show: false },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } },
        min: 0,
        max: registrationsMax,
      },
      {
        type: "value",
        position: "right",
        axisLabel: { show: false },
        splitLine: { show: false },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } },
        min: 0,
        max: salesCountMax,
      },
      {
        type: "value",
        position: "right",
        offset: 52,
        axisLabel: { show: false },
        splitLine: { show: false },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } },
        min: 0,
        max: salesAmountMax,
      },
    ],
    series: [
      {
        name: "Регистрации",
        type: "line",
        yAxisIndex: 0,
        smooth: true,
        symbol: "circle",
        lineStyle: { width: 2, color: "#38bdf8" },
        itemStyle: { color: "#38bdf8" },
        areaStyle: { opacity: 0.12, color: "#38bdf8" },
        label: { show: false },
        data: registrations,
      },
      {
        name: "Продажи",
        type: "line",
        yAxisIndex: 1,
        data: salesCount,
        smooth: true,
        symbol: "circle",
        lineStyle: { width: 2, color: "rgba(94,234,212,0.9)" },
        itemStyle: { color: "rgba(94,234,212,0.9)" },
        areaStyle: { opacity: 0.12, color: "rgba(94,234,212,0.6)" },
        label: { show: false },
      },
      {
        name: "Сумма продаж",
        type: "line",
        yAxisIndex: 2,
        smooth: true,
        symbol: "circle",
        lineStyle: { width: 2, color: "#a78bfa" },
        itemStyle: { color: "#a78bfa" },
        areaStyle: { opacity: 0.1, color: "#a78bfa" },
        label: { show: false },
        data: salesAmount,
      },
    ],
  } as const;
}

export function buildMetricCards(metrics?: SummaryMetrics) {
  return [
    {
      key: "revenue",
      title: "Сумма продаж",
      value: metrics ? formatCurrency(metrics.salesAmount) : "—",
      description: "за выбранный период",
    },
    {
      key: "average",
      title: "Средний чек",
      value: metrics ? formatCurrency(metrics.averageCheck) : "—",
      description: "средняя сумма покупки",
    },
    {
      key: "customers",
      title: "Новые клиенты",
      value: metrics ? formatNumber(metrics.newCustomers) : "—",
      description: "зарегистрировались",
    },
    {
      key: "active",
      title: "Активные клиенты",
      value: metrics ? formatNumber(metrics.activeCustomers) : "—",
      description: "совершили покупку",
    },
    {
      key: "transactions",
      title: "Среднее количество покупок",
      value: metrics ? formatDecimal(metrics.averagePurchasesPerCustomer) : "—",
      description: "на одного покупателя",
    },
    {
      key: "frequency",
      title: "Частота визитов",
      value:
        metrics && metrics.visitFrequencyDays != null
          ? `${formatDecimal(metrics.visitFrequencyDays)} дн.`
          : "—",
      description: "Среднее количество дней между покупками",
    },
  ];
}
