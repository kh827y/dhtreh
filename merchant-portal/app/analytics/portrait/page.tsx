"use client";

import React from "react";
import { Card, CardBody, Chart, Skeleton } from "@loyalty/ui";
import { useTheme } from "../../../components/ThemeProvider";
import { Users, BarChart3, TrendingUp, ChevronDown } from "lucide-react";

type GenderItem = { sex: string; customers: number; transactions: number; revenue: number; averageCheck: number };
type AgeItem = { age: number; customers: number; transactions: number; revenue: number; averageCheck: number };
type SexAgeItem = { sex: string; age: number; customers: number; transactions: number; revenue: number; averageCheck: number };
type Resp = { gender: GenderItem[]; age: AgeItem[]; sexAge: SexAgeItem[] };

type AudienceOption = { value: string; label: string };
type DateRange = { from: string; to: string };
type PeriodValue = "week" | "month" | "quarter" | "year" | "all" | "custom";

const periodOptions: Array<{ value: PeriodValue; label: string }> = [
  { value: "week", label: "За неделю" },
  { value: "month", label: "За месяц" },
  { value: "quarter", label: "За квартал" },
  { value: "year", label: "За год" },
  { value: "all", label: "За всё время" },
  { value: "custom", label: "Произвольный период" },
];

const defaultAudienceOption: AudienceOption = { value: "", label: "Все клиенты" };

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDefaultRange = (): DateRange => {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 29);
  return { from: formatDateInput(fromDate), to: formatDateInput(today) };
};

const normalizeSexKey = (sex: string | null | undefined): "M" | "F" | "U" => {
  const raw = (sex || "").toString().trim().toUpperCase();
  if (raw === "M" || raw === "MALE" || raw === "М" || raw === "МУЖ" || raw === "МУЖСКОЙ") return "M";
  if (raw === "F" || raw === "FEMALE" || raw === "Ж" || raw === "ЖЕН" || raw === "ЖЕНСКИЙ") return "F";
  return "U";
};

const sexDisplayName: Record<string, string> = {
  M: "Мужской",
  F: "Женский",
  U: "Не указан",
};

const clampAgeValue = (value: number | null | undefined): number | null => {
  if (value == null || Number.isNaN(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
};

const formatInteger = (value: number) =>
  Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "0";

const formatCurrency = (value: number) => `${formatInteger(value)} ₽`;

const describeSexAgeLabel = (label: string) => {
  if (typeof label !== "string" || !label) return "";
  const [sexPrefix, agePart] = label.split("-");
  const gender =
    sexPrefix === "М"
      ? "Мужской"
      : sexPrefix === "Ж"
        ? "Женский"
        : sexPrefix || "Не указан";
  const ageValue = Number(agePart);
  if (Number.isFinite(ageValue)) return `${gender}, ${ageValue} лет`;
  return gender;
};

export default function AnalyticsPortraitPage() {
  const { theme } = useTheme();
  const textColor = theme === "light" ? "#334155" : "rgba(226,232,240,0.85)";
  const axisColor = theme === "light" ? "#64748b" : "rgba(226,232,240,0.9)";
  const tooltipBg = theme === "light" ? "#ffffff" : "rgba(15,23,42,0.95)";
  const tooltipText = theme === "light" ? "#0f172a" : "#f1f5f9";
  const borderColor = theme === "light" ? "#e2e8f0" : "#0f172a";
  const [period, setPeriod] = React.useState<PeriodValue>("all");
  const [customRange, setCustomRange] = React.useState<DateRange>(getDefaultRange());
  const [isPeriodMenuOpen, setPeriodMenuOpen] = React.useState(false);
  const [audiences, setAudiences] = React.useState<AudienceOption[]>([defaultAudienceOption]);
  const [audience, setAudience] = React.useState<AudienceOption>(defaultAudienceOption);
  const [audiencesLoading, setAudiencesLoading] = React.useState(true);
  const [audiencesError, setAudiencesError] = React.useState("");
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setAudiencesLoading(true);
      setAudiencesError("");
      try {
        const res = await fetch(
          `/api/portal/audiences?includeSystem=1&limit=200`,
          { cache: "no-store" }
        );
        const text = await res.text();
        let json: any = [];
        if (text) {
          try {
            json = JSON.parse(text);
          } catch (error) {
            console.error("Failed to parse audiences response", error);
            json = [];
          }
        }
        if (!res.ok) {
          const message =
            (json && typeof json === "object" && "message" in json
              ? String((json as any).message)
              : "Ошибка загрузки аудиторий") || "Ошибка загрузки аудиторий";
          throw new Error(message);
        }
        const list = Array.isArray(json) ? json : [];
        const options: AudienceOption[] = [];
        for (const item of list) {
          const rawValue =
            typeof item?.id !== "undefined"
              ? item.id
              : typeof item?.segmentId !== "undefined"
                ? item.segmentId
                : "";
          const value = String(rawValue || "").trim();
          if (!value) continue;
          const labelSource =
            (typeof item?.name === "string" && item.name) ||
            (typeof item?.title === "string" && item.title) ||
            value;
          options.push({ value, label: labelSource });
        }
        const uniqueOptions = options.reduce<AudienceOption[]>((acc, option) => {
          if (!acc.some((existing) => existing.value === option.value)) {
            acc.push(option);
          }
          return acc;
        }, []);
        if (!cancelled) {
          const merged = [defaultAudienceOption, ...uniqueOptions];
          setAudiences(merged);
          setAudience((current) => {
            const exists = merged.find((item) => item.value === current.value);
            return exists || current.value === ""
              ? current
              : defaultAudienceOption;
          });
        }
      } catch (error: any) {
        if (!cancelled) {
          setAudiences([defaultAudienceOption]);
          setAudience(defaultAudienceOption);
          setAudiencesError(
            String(error?.message || "Не удалось загрузить аудитории")
          );
        }
      } finally {
        if (!cancelled) setAudiencesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const params = new URLSearchParams();
        if (period === "custom") {
          if (!customRange.from || !customRange.to) {
            setMsg("Укажите даты начала и окончания");
            setLoading(false);
            return;
          }
          params.set("from", customRange.from);
          params.set("to", customRange.to);
        } else if (period === "all") {
          params.set("from", "1970-01-01");
          params.set("to", formatDateInput(new Date()));
        } else {
          params.set("period", period);
        }
        if (audience.value) params.set("segmentId", audience.value);
        const res = await fetch(`/api/portal/analytics/portrait?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Ошибка загрузки");
        if (!cancelled) setData(json);
      } catch (error: any) {
        if (!cancelled && error?.name !== "AbortError") setMsg(String(error?.message || error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [audience, customRange.from, customRange.to, period]);

  const normalizedGenderData = React.useMemo(() => {
    const map = new Map<"M" | "F" | "U", GenderItem>();
    for (const item of data?.gender || []) {
      const key = normalizeSexKey(item.sex);
      const existing = map.get(key);
      if (existing) {
        existing.customers += item.customers || 0;
        existing.transactions += item.transactions || 0;
        existing.revenue += item.revenue || 0;
      } else {
        map.set(key, {
          sex: key,
          customers: item.customers || 0,
          transactions: item.transactions || 0,
          revenue: item.revenue || 0,
          averageCheck: 0,
        });
      }
    }
    for (const bucket of map.values()) {
      bucket.averageCheck =
        bucket.transactions > 0 ? Math.round(bucket.revenue / bucket.transactions) : 0;
      bucket.revenue = Math.round(bucket.revenue);
    }
    return Array.from(map.values());
  }, [data]);

  const genderOption = React.useMemo(() => {
    if (!normalizedGenderData.length) {
      return {
        tooltip: { trigger: "item", formatter: () => "" },
        series: [
          {
            name: "Пол",
            type: "pie",
            radius: ["38%", "70%"],
            labelLine: { show: false },
            data: [],
          },
        ],
      } as const;
    }
    const seriesData = normalizedGenderData.map((item) => ({
      value: item.customers,
      name: sexDisplayName[item.sex] || item.sex,
    }));
    return {
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const value = Number(params?.value || 0);
          const percent = typeof params?.percent === "number" ? params.percent : null;
          const percentText = percent != null ? ` (${Math.round(percent)}%)` : "";
          return `${params?.name}: ${formatInteger(value)}${percentText}`;
        },
      },
      legend: {
        orient: "horizontal",
        bottom: 0,
        data: seriesData.map((item) => item.name),
        textStyle: { color: textColor },
      },
      series: [
        {
          name: "Пол",
          type: "pie",
          radius: ["38%", "70%"],
          itemStyle: { borderRadius: 12, borderColor: borderColor, borderWidth: 2 },
          labelLine: { show: false },
          label: { formatter: "{b}", color: textColor },
          data: seriesData,
        },
      ],
    } as const;
  }, [normalizedGenderData, textColor, borderColor]);

  const genderBarsOption = React.useMemo(() => {
    if (!normalizedGenderData.length) return null;
    const map = new Map(normalizedGenderData.map((item) => [item.sex as "M" | "F" | "U", item]));
    const preferred: Array<"M" | "F"> = ["M", "F"];
    let categories: Array<"M" | "F" | "U"> = preferred.filter((key) => map.has(key));
    if (!categories.length) {
      categories = normalizedGenderData
        .map((item) => item.sex as "M" | "F" | "U")
        .filter((value, index, self) => self.indexOf(value) === index);
    }
    const labels = categories.map((key) => sexDisplayName[key] || key);
    const metrics: Array<{
      key: "averageCheck" | "transactions" | "revenue";
      name: string;
      color: string;
      formatter: (value: number) => string;
      yAxisPosition: "left" | "right";
      yAxisOffset: number;
    }> = [
      {
        key: "averageCheck",
        name: "Средний чек",
        color: "#f97316",
        formatter: formatCurrency,
        yAxisPosition: "left",
        yAxisOffset: 0,
      },
      {
        key: "transactions",
        name: "Количество продаж",
        color: "#38bdf8",
        formatter: formatInteger,
        yAxisPosition: "right",
        yAxisOffset: 0,
      },
      {
        key: "revenue",
        name: "Сумма продаж",
        color: "#22c55e",
        formatter: formatCurrency,
        yAxisPosition: "right",
        yAxisOffset: 48,
      },
    ];
    return {
      color: metrics.map((metric) => metric.color),
      legend: {
        top: 4,
        textStyle: { color: textColor },
        data: metrics.map((metric) => metric.name),
      },
      grid: { left: 16, right: 32, top: 48, bottom: 32 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: tooltipBg,
        borderColor: theme === "light" ? "#e2e8f0" : "rgba(148,163,184,0.2)",
        textStyle: { color: tooltipText },
        formatter: (params: any) => {
          if (!Array.isArray(params) || !params.length) return "";
          const axisLabel = params[0]?.axisValueLabel || params[0]?.axisValue || "";
          const lines: string[] = [];
          if (axisLabel) lines.push(String(axisLabel));
          for (const item of params) {
            const meta = metrics.find((metric) => metric.name === item.seriesName);
            const formatter = meta?.formatter || formatInteger;
            const value = Number(item?.value ?? 0);
            lines.push(`${item.marker}${item.seriesName}: ${formatter(value)}`);
          }
          return lines.join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { alignWithLabel: true },
        axisLabel: { color: axisColor },
      },
      yAxis: metrics.map((metric, index) => ({
        type: "value",
        position: metric.yAxisPosition,
        offset: metric.yAxisOffset,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        max: (value: { max: number }) => {
          const base = value?.max ?? 0;
          if (base <= 0) return 1;
          return Math.round(base * 1.2);
        },
      })),
      series: metrics.map((metric, index) => ({
        name: metric.name,
        type: "bar",
        yAxisIndex: index,
        data: categories.map((sex) => map.get(sex)?.[metric.key] ?? 0),
        barMaxWidth: 36,
        itemStyle: { borderRadius: [8, 8, 0, 0], color: metric.color },
      })),
    } as const;
  }, [normalizedGenderData, textColor, axisColor, tooltipBg, tooltipText, theme]);

  const ageOption = React.useMemo(() => {
    const items = (data?.age || []).map((item) => {
      const ageValue = clampAgeValue(item.age);
      const revenue = item.revenue || 0;
      const transactions = item.transactions || 0;
      return {
        age: ageValue ?? 0,
        customers: item.customers || 0,
        transactions,
        revenue,
        averageCheck:
          item.averageCheck || (transactions > 0 ? Math.round(revenue / transactions) : 0),
      };
    });
    items.sort((a, b) => a.age - b.age);
    const customersSeries = items.map((item) => [item.age, item.customers]);
    const averageCheckSeries = items.map((item) => [item.age, item.averageCheck]);
    const transactionsSeries = items.map((item) => [item.age, item.transactions]);
    const revenueSeries = items.map((item) => [item.age, item.revenue]);
    const seriesFormatters: Record<string, (value: number) => string> = {
      "Количество клиентов": formatInteger,
      "Средний чек": formatCurrency,
      "Количество продаж": formatInteger,
      "Сумма продаж": formatCurrency,
    };
    return {
      color: ["#38bdf8", "#f97316", "#6366f1", "#22c55e"],
      legend: {
        top: 4,
        textStyle: { color: textColor },
      },
      grid: { left: 32, right: 32, top: 48, bottom: 80 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        backgroundColor: tooltipBg,
        borderColor: theme === "light" ? "#e2e8f0" : "rgba(148,163,184,0.2)",
        textStyle: { color: tooltipText },
        formatter: (params: any) => {
          if (!Array.isArray(params) || !params.length) return "";
          const axisValue = params[0]?.axisValue;
          const header =
            axisValue !== undefined
              ? `Возраст: ${formatInteger(Number(axisValue) || 0)}`
              : "";
          const body = params
            .map((item) => {
              const value = Array.isArray(item.value)
                ? Number(item.value[1] ?? 0)
                : Number(item.value ?? 0);
              const formatter = seriesFormatters[item.seriesName] || formatInteger;
              return `${item.marker}${item.seriesName}: ${formatter(value)}`;
            })
            .join("<br/>");
          return [header, body].filter((line) => line).join("<br/>");
        },
      },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { color: axisColor },
        splitLine: { show: false },
      },
      yAxis: [0, 1, 2, 3].map((_, index) => ({
        type: "value",
        position: index % 2 === 0 ? "left" : "right",
        offset: index < 2 ? 0 : 48,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      })),
      dataZoom: [
        {
          type: "slider",
          bottom: 16,
          min: 0,
          max: 100,
          startValue: 15,
          endValue: 50,
          height: 18,
          brushSelect: false,
        },
        {
          type: "inside",
          min: 0,
          max: 100,
          startValue: 15,
          endValue: 50,
        },
      ],
      series: [
        {
          name: "Количество клиентов",
          type: "line",
          yAxisIndex: 0,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          emphasis: { focus: "series" },
          data: customersSeries,
        },
        {
          name: "Средний чек",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          emphasis: { focus: "series" },
          data: averageCheckSeries,
        },
        {
          name: "Количество продаж",
          type: "line",
          yAxisIndex: 2,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          emphasis: { focus: "series" },
          data: transactionsSeries,
        },
        {
          name: "Сумма продаж",
          type: "line",
          yAxisIndex: 3,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          emphasis: { focus: "series" },
          data: revenueSeries,
        },
      ],
    } as const;
  }, [data, textColor, axisColor, tooltipBg, tooltipText, theme]);

  const sexAgeChart = React.useMemo(() => {
    const categories: string[] = [];
    for (let age = 0; age <= 100; age++) {
      categories.push(`М-${age}`);
      categories.push(`Ж-${age}`);
    }
    const aggregated = new Map<string, { customers: number; transactions: number; revenue: number }>();
    for (const item of data?.sexAge || []) {
      const sexKey = normalizeSexKey(item.sex);
      if (sexKey === "U") continue;
      const ageValue = clampAgeValue(item.age);
      if (ageValue == null) continue;
      const key = `${sexKey}:${ageValue}`;
      if (!aggregated.has(key)) {
        aggregated.set(key, { customers: 0, transactions: 0, revenue: 0 });
      }
      const bucket = aggregated.get(key)!;
      bucket.customers += item.customers || 0;
      bucket.transactions += item.transactions || 0;
      bucket.revenue += item.revenue || 0;
    }
    const customersData: number[] = [];
    const avgCheckData: number[] = [];
    const transactionsData: number[] = [];
    const revenueData: number[] = [];
    let hasData = false;
    for (const label of categories) {
      const [prefix, ageStr] = label.split("-");
      const sexKey = prefix === "Ж" ? "F" : "M";
      const ageValue = Number(ageStr);
      const bucket = aggregated.get(`${sexKey}:${ageValue}`) || null;
      const customers = bucket ? bucket.customers : 0;
      const transactions = bucket ? bucket.transactions : 0;
      const revenue = bucket ? bucket.revenue : 0;
      const avgCheck = transactions > 0 ? Math.round(revenue / transactions) : 0;
      if (customers || transactions || revenue || avgCheck) hasData = true;
      customersData.push(customers);
      avgCheckData.push(avgCheck);
      transactionsData.push(transactions);
      revenueData.push(Math.round(revenue));
    }
    const seriesFormatters: Record<string, (value: number) => string> = {
      "Количество клиентов": formatInteger,
      "Средний чек": formatCurrency,
      "Количество продаж": formatInteger,
      "Сумма продаж": formatCurrency,
    };
    const defaultStartIndex = categories.indexOf("М-20");
    const defaultEndIndex = categories.indexOf("Ж-37");
    const maxIndex = categories.length - 1;
    const sliderStart = Math.max(
      0,
      Math.min(maxIndex, defaultStartIndex >= 0 ? defaultStartIndex : 40),
    );
    const sliderEnd = Math.max(
      sliderStart,
      Math.min(maxIndex, defaultEndIndex >= 0 ? defaultEndIndex : sliderStart + 34),
    );
    return {
      hasData,
      option: {
        color: ["#38bdf8", "#f97316", "#6366f1", "#22c55e"],
        legend: {
          top: 4,
          textStyle: { color: textColor },
        },
        grid: { left: 32, right: 32, top: 48, bottom: 80 },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line" },
          backgroundColor: tooltipBg,
          borderColor: theme === "light" ? "#e2e8f0" : "rgba(148,163,184,0.2)",
          textStyle: { color: tooltipText },
          formatter: (params: any) => {
            if (!Array.isArray(params) || !params.length) return "";
            const axisValue = params[0]?.axisValue;
            const header =
              typeof axisValue === "string" ? describeSexAgeLabel(axisValue) : "";
            const body = params
              .map((item) => {
                const value = Number(item?.value ?? 0);
                const formatter = seriesFormatters[item.seriesName] || formatInteger;
                return `${item.marker}${item.seriesName}: ${formatter(value)}`;
              })
              .join("<br/>");
            return [header, body].filter((line) => line).join("<br/>");
          },
        },
        xAxis: {
          type: "category",
          data: categories,
          axisTick: { alignWithLabel: true },
          axisLabel: {
            color: axisColor,
            interval: 0,
            rotate: 45,
            hideOverlap: true,
          },
        },
        yAxis: [0, 1, 2, 3].map((_, index) => ({
          type: "value",
          position: index % 2 === 0 ? "left" : "right",
          offset: index < 2 ? 0 : 48,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        })),
        dataZoom: [
          {
            type: "slider",
            bottom: 16,
            startValue: sliderStart,
            endValue: sliderEnd,
            minSpan: 10,
            brushSelect: false,
          },
          {
            type: "inside",
            startValue: sliderStart,
            endValue: sliderEnd,
          },
        ],
        series: [
          {
            name: "Количество клиентов",
            type: "line",
            yAxisIndex: 0,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2 },
            emphasis: { focus: "series" },
            data: customersData,
          },
          {
            name: "Средний чек",
            type: "line",
            yAxisIndex: 1,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2 },
            emphasis: { focus: "series" },
            data: avgCheckData,
          },
          {
            name: "Количество продаж",
            type: "line",
            yAxisIndex: 2,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2 },
            emphasis: { focus: "series" },
            data: transactionsData,
          },
          {
            name: "Сумма продаж",
            type: "line",
            yAxisIndex: 3,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2 },
            emphasis: { focus: "series" },
            data: revenueData,
          },
        ],
      } as const,
    };
  }, [data, textColor, axisColor, tooltipBg, tooltipText, theme]);

  const totalGenderCustomers = React.useMemo(
    () => normalizedGenderData.reduce((acc, item) => acc + (item.customers || 0), 0),
    [normalizedGenderData],
  );

  const totals = React.useMemo(() => {
    const transactions = normalizedGenderData.reduce(
      (acc, item) => acc + (item.transactions || 0),
      0,
    );
    const revenue = normalizedGenderData.reduce((acc, item) => acc + (item.revenue || 0), 0);
    const averageCheck = transactions > 0 ? Math.round(revenue / transactions) : 0;
    return {
      customers: totalGenderCustomers,
      transactions,
      revenue: Math.round(revenue),
      averageCheck,
    };
  }, [normalizedGenderData, totalGenderCustomers]);

  const genderInsights = React.useMemo(() => {
    if (!normalizedGenderData.length) return [];
    return normalizedGenderData
      .map((item) => ({
        ...item,
        share:
          totalGenderCustomers > 0
            ? Math.round((item.customers / totalGenderCustomers) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.share - a.share);
  }, [normalizedGenderData, totalGenderCustomers]);

  const genderLeader = genderInsights[0] || null;

  const ageHighlight = React.useMemo(() => {
    const list = (data?.age || [])
      .map((item) => {
        const ageValue = clampAgeValue(item.age);
        if (ageValue == null) return null;
        const transactions = item.transactions || 0;
        const revenue = item.revenue || 0;
        return {
          age: ageValue,
          customers: item.customers || 0,
          averageCheck:
            item.averageCheck || (transactions > 0 ? Math.round(revenue / transactions) : 0),
        };
      })
      .filter(Boolean) as Array<{ age: number; customers: number; averageCheck: number }>;
    if (!list.length) return null;
    list.sort((a, b) => b.customers - a.customers);
    return list[0];
  }, [data?.age]);

  const isInitialLoading = loading && !data;
  const isRefreshing = loading && Boolean(data);
const topAverageCheckGroup = React.useMemo(() => {
  const rows = (data?.sexAge || []).map((item) => {
    const age = clampAgeValue(item.age);
    const sex = normalizeSexKey(item.sex);
      const customers = item.customers || 0;
      const avg =
        item.averageCheck ||
        (item.transactions && item.transactions > 0
          ? Math.round(item.revenue / item.transactions)
          : 0);
      return { age, sex, customers, averageCheck: avg };
    });
    const valid = rows.filter((row) => row.age != null);
    if (!valid.length) return null;
    valid.sort((a, b) => b.averageCheck - a.averageCheck);
    const leader =
      valid.find((row) => row.averageCheck > 0 && row.customers > 0) ||
      valid[0];
    if (!leader) return null;
    const sexLabel =
      leader.sex === "F" ? "Женщины" : leader.sex === "M" ? "Мужчины" : "Не указан";
    const ageLabel = leader.age != null ? `${leader.age} лет` : "";
    return {
      title: ageLabel ? `${sexLabel}, ${ageLabel}` : sexLabel,
      averageCheck: leader.averageCheck,
    };
  }, [data?.sexAge]);

  const periodLabel = React.useMemo(() => {
    switch (period) {
      case "week":
        return "За неделю";
      case "quarter":
        return "За квартал";
      case "year":
        return "За год";
      case "all":
        return "За всё время";
      case "custom":
        return "Произвольный период";
      default:
        return "За месяц";
    }
  }, [period]);

  const handleFromChange = React.useCallback(
    (value: string) => {
      setCustomRange((prev) => ({
        from: value,
        to: prev.to && prev.to < value ? value : prev.to,
      }));
    },
    [],
  );

  const handleToChange = React.useCallback((value: string) => {
    setCustomRange((prev) => ({ ...prev, to: value }));
  }, []);

  const heroStats = React.useMemo(
    () => [
      {
        key: "customers",
        label: "Клиентов",
        value: formatInteger(totals.customers),
        hint: "Активные в выборке",
        icon: <Users size={18} />,
        accent: "indigo",
      },
      {
        key: "averageCheck",
        label: "Средний чек",
        value: formatCurrency(totals.averageCheck),
        hint: `${formatInteger(totals.transactions)} продаж`,
        icon: <BarChart3 size={18} />,
        accent: "amber",
      },
      {
        key: "revenue",
        label: "Сумма продаж",
        value: formatCurrency(totals.revenue),
        hint: audience.label || "Все клиенты",
        icon: <TrendingUp size={18} />,
        accent: "emerald",
      },
    ],
    [audience.label, totals.averageCheck, totals.customers, totals.revenue, totals.transactions],
  );

  const ChartSkeletonBlock = ({ columns = 8, tall = false }: { columns?: number; tall?: boolean }) => (
    <div className="chart-skeleton" style={{ overflow: 'hidden', isolation: 'isolate' }}>
      <div className="chart-skeleton-header" style={{ overflow: 'hidden' }}>
        <Skeleton width={120} height={12} />
        <Skeleton width={80} height={12} />
      </div>
      <div className="chart-skeleton-body" style={{ overflow: 'hidden', isolation: 'isolate' }}>
        <div className="chart-skeleton-bars" style={{ overflow: 'hidden' }}>
          {Array.from({ length: columns }).map((_, idx) => {
            const base = tall ? 120 : 80;
            const height = base + ((idx % 4) + 1) * 12;
            const opacity = 0.7 + (idx % 5) * 0.05;
            return <div key={idx} className="chart-skeleton-bar" style={{ height, opacity }} />;
          })}
        </div>
      </div>
      <div className="chart-skeleton-axis" style={{ overflow: 'hidden' }}>
        <Skeleton width={50} height={10} />
        <Skeleton width={40} height={10} />
        <Skeleton width={50} height={10} />
      </div>
    </div>
  );

  const PieChartSkeleton = () => (
    <div className="chart-skeleton" style={{ overflow: 'hidden', isolation: 'isolate' }}>
      <div className="chart-skeleton-header" style={{ overflow: 'hidden' }}>
        <Skeleton width={120} height={12} />
        <Skeleton width={80} height={12} />
      </div>
      <div className="chart-skeleton-body chart-skeleton-body-pie" style={{ overflow: 'hidden', isolation: 'isolate' }}>
        <div className="chart-skeleton-pie" style={{ overflow: 'hidden', isolation: 'isolate' }}>
          <div className="chart-skeleton-pie-center" />
        </div>
      </div>
      <div className="chart-skeleton-axis" style={{ overflow: 'hidden' }}>
        <Skeleton width={60} height={10} />
        <Skeleton width={50} height={10} />
        <Skeleton width={60} height={10} />
      </div>
    </div>
  );

  const LineChartSkeleton = () => (
    <div className="line-skeleton" style={{ overflow: 'hidden', isolation: 'isolate' }}>
      <div className="line-skeleton-legend" style={{ overflow: 'hidden' }}>
        <span className="line-skeleton-dot dot-1" />
        <span className="line-skeleton-dot dot-2" />
        <span className="line-skeleton-dot dot-3" />
        <span className="line-skeleton-dot dot-4" />
      </div>
      <div className="line-skeleton-area" style={{ overflow: 'hidden', isolation: 'isolate' }}>
        <svg viewBox="0 0 200 80" preserveAspectRatio="none">
          <path className="line-skeleton-path p1" d="M0,58 Q8,55 16,52 Q24,48 32,44 Q40,40 48,35 Q56,30 64,26 Q72,22 80,20 Q88,18 96,22 Q104,26 112,30 Q120,34 128,32 Q136,30 144,34 Q152,38 160,42 Q168,46 176,50 Q184,54 192,56 L200,58" />
          <path className="line-skeleton-path p2" d="M0,65 Q10,63 20,60 Q30,57 40,53 Q50,49 60,46 Q70,43 80,40 Q90,37 100,36 Q110,35 120,38 Q130,41 140,44 Q150,47 160,51 Q170,55 180,58 Q190,61 200,63" />
          <path className="line-skeleton-path p3" d="M0,52 Q7,48 14,44 Q21,40 28,35 Q35,30 42,25 Q49,20 56,16 Q63,12 70,10 Q77,8 84,12 Q91,16 98,20 Q105,24 112,22 Q119,20 126,24 Q133,28 140,32 Q147,36 154,34 Q161,32 168,36 Q175,40 182,44 Q189,48 200,50" />
          <path className="line-skeleton-path p4" d="M0,70 Q12,68 24,66 Q36,64 48,60 Q60,56 72,53 Q84,50 96,48 Q108,46 120,48 Q132,50 144,54 Q156,58 168,61 Q180,64 192,66 L200,68" />
        </svg>
      </div>
      <div className="line-skeleton-zoom" />
    </div>
  );

  return (
    <div className="portrait-page animate-in">
      <section className="portrait-hero">
        <div className="portrait-hero-grid">
          <div className="portrait-hero-intro">
            <div className="portrait-eyebrow">Audience DNA</div>
            <div className="portrait-title-row">
              <h1 className="portrait-title">Портрет клиента</h1>
              <div className="portrait-period-switcher">
                <button
                  type="button"
                  className={`portrait-live-pill period${isPeriodMenuOpen ? " open" : ""}`}
                  onClick={() => setPeriodMenuOpen((prev) => !prev)}
                >
                  <span className="live-dot" />
                  {period !== "custom" && <span>{periodLabel}</span>}
                  <ChevronDown size={14} className="period-arrow" />
                </button>
                {isPeriodMenuOpen && (
                  <div className="portrait-period-menu">
                    {periodOptions.map((opt) => (
                      <button
                        key={opt.value}
                        className={`period-option${period === opt.value ? " active" : ""}`}
                        onClick={() => {
                          setPeriod(opt.value);
                          setPeriodMenuOpen(false);
                        }}
                        type="button"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {period === "custom" && (
                <div className="portrait-custom-range-inline">
                  <div className="date-range-wrapper">
                    <input
                      type="date"
                      value={customRange.from}
                      onChange={(event) => handleFromChange(event.target.value)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--fg)",
                        outline: "none",
                        fontSize: 13,
                        width: 110,
                      }}
                    />
                    <span style={{ color: "var(--fg-dim)" }}>→</span>
                    <input
                      type="date"
                      value={customRange.to}
                      onChange={(event) => handleToChange(event.target.value)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--fg)",
                        outline: "none",
                        fontSize: 13,
                        width: 110,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            <p className="portrait-subtitle">
              Реконструируем профиль клиентов по полу, возрасту и покупательской активности.
              Используйте сегментацию, чтобы увидеть нюансы поведения и планировать акции точнее.
            </p>
            <div className="portrait-pill-row">
              <div className="portrait-pill">
                <span className="pill-label">Лидер по полу</span>
                <span className="pill-value">
                  {genderLeader
                    ? `${sexDisplayName[genderLeader.sex] || genderLeader.sex} · ${formatInteger(genderLeader.customers)}`
                    : "Нет данных"}
                </span>
              </div>
              <div className="portrait-pill">
                <span className="pill-label">Преобладающий возраст</span>
                <span className="pill-value">
                  {ageHighlight
                    ? `${ageHighlight.age} лет · средний чек ${formatCurrency(ageHighlight.averageCheck)}`
                    : "Данных пока нет"}
                </span>
              </div>
              <div className="portrait-pill">
                <span className="pill-label">Топ среднего чека</span>
                <span className="pill-value">
                  {topAverageCheckGroup
                    ? `${topAverageCheckGroup.title} · ${formatCurrency(topAverageCheckGroup.averageCheck)}`
                    : "Данных пока нет"}
                </span>
              </div>
            </div>
          </div>
          <div className="portrait-hero-panel">
            <div className="portrait-control">
              <div className="portrait-control-head">
                <span className="portrait-control-label">Аудитория</span>
                {isRefreshing && <span className="pill-refresh">обновляем...</span>}
              </div>
              {audiencesLoading ? (
                <div style={{ overflow: 'hidden', borderRadius: 12 }}><Skeleton height={44} /></div>
              ) : (
                <div className="portrait-select-wrap">
                  <select
                    value={audience.value}
                    onChange={(event) => {
                      const next =
                        audiences.find((item) => item.value === event.target.value) ||
                        defaultAudienceOption;
                      setAudience(next);
                    }}
                    className="portrait-select"
                  >
                    {audiences.map((item) => (
                      <option key={item.value || "__default"} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {audiencesError ? (
                <div className="portrait-control-error">{audiencesError}</div>
              ) : (
                <div className="portrait-control-hint">
                  {audience.label ? `Фокус на сегменте: ${audience.label}` : "Выберите сегмент для точных инсайтов"}
                </div>
              )}
            </div>
            <div className="portrait-hero-stats">
              {isInitialLoading
                ? Array.from({ length: 3 }).map((_, idx) => <div key={idx} style={{ overflow: 'hidden', borderRadius: 14 }}><Skeleton height={72} /></div>)
                : heroStats.map((stat) => (
                    <div key={stat.key} className={`portrait-hero-stat accent-${stat.accent}`}>
                      <div className="stat-icon">{stat.icon}</div>
                      <div className="stat-copy">
                        <span className="stat-label">{stat.label}</span>
                        <div className="stat-value">{stat.value}</div>
                        <span className="stat-hint">{stat.hint}</span>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      </section>

      {msg && !loading && <div className="portrait-alert">{msg}</div>}

      <div className="portrait-grid">
        <Card className="portrait-panel" hover>
          <div className="portrait-panel-head">
            <div className="panel-title-block">
              <div className="panel-icon">
                <Users size={18} />
              </div>
              <div>
                <div className="panel-title">Гендерный профиль</div>
                <div className="panel-subtitle">Доля клиентов и экономика по полу</div>
              </div>
            </div>
            <div className="panel-pill">{audience.label || "Все клиенты"}</div>
          </div>
          <CardBody className="portrait-panel-body">
            <div className="panel-grid two-columns">
              <div className="chart-shell">
                {isInitialLoading ? (
                  <PieChartSkeleton />
                ) : (
                  <Chart option={genderOption as any} height={320} />
                )}
              </div>
              <div className="panel-side">
                <div className="chart-shell ghost">
                  {isInitialLoading ? (
                    <ChartSkeletonBlock columns={5} />
                ) : genderBarsOption ? (
                  <Chart option={genderBarsOption as any} height={260} />
                ) : (
                  <div className="panel-empty">Недостаточно данных по полу</div>
                )}
              </div>
              <div className="gender-list">
                  {isInitialLoading ? (
                    Array.from({ length: 2 }).map((_, idx) => <div key={idx} style={{ overflow: 'hidden', borderRadius: 12 }}><Skeleton height={72} /></div>)
                  ) : genderInsights.length ? (
                    genderInsights.map((item) => (
                      <div key={item.sex} className="gender-row">
                        <div className="gender-row-head">
                          <span className="gender-name">{sexDisplayName[item.sex] || item.sex}</span>
                          <span className="gender-share">{item.share.toFixed(1)}%</span>
                        </div>
                        <div className="gender-row-meta">
                          <span>{formatInteger(item.customers)} клиентов</span>
                          <span>{formatInteger(item.transactions)} продаж</span>
                          <span>Средний чек {formatCurrency(item.averageCheck)}</span>
                        </div>
                        <div className="gender-progress">
                          <div style={{ width: `${Math.min(100, Math.max(6, item.share))}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="panel-empty">Нет распределения по полу</div>
                  )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

        <Card className="portrait-panel" hover>
          <div className="portrait-panel-head">
            <div className="panel-title-block">
              <div className="panel-icon">
                <BarChart3 size={18} />
              </div>
              <div>
                <div className="panel-title">Возраст и чек</div>
                <div className="panel-subtitle">Распределение клиентов по возрастам и ключевым метрикам</div>
              </div>
            </div>
            <div className="panel-pill muted">Скролл и масштаб доступен</div>
          </div>
          <CardBody className="portrait-panel-body">
            <div className="chart-shell wide">
              {isInitialLoading ? (
                <LineChartSkeleton />
              ) : (
                <Chart option={ageOption as any} height={360} />
              )}
            </div>
            <div className="portrait-meta-grid">
              {isInitialLoading ? (
                Array.from({ length: 3 }).map((_, idx) => <div key={idx} style={{ overflow: 'hidden', borderRadius: 12 }}><Skeleton height={90} /></div>)
              ) : (
                <>
                  <div className="meta-card">
                    <div className="meta-label">Преобладающий возраст</div>
                    <div className="meta-value">{ageHighlight ? `${ageHighlight.age} лет` : "Нет данных"}</div>
                    <div className="meta-hint">
                      {ageHighlight
                        ? `Средний чек ${formatCurrency(ageHighlight.averageCheck)}`
                        : "Как только появятся продажи, покажем лидеров"}
                    </div>
                  </div>
                  <div className="meta-card">
                    <div className="meta-label">Средний чек</div>
                    <div className="meta-value">{formatCurrency(totals.averageCheck)}</div>
                    <div className="meta-hint">{formatInteger(totals.transactions)} продаж в выборке</div>
                  </div>
                  <div className="meta-card">
                    <div className="meta-label">Клиентов в выборке</div>
                    <div className="meta-value">{formatInteger(totals.customers)}</div>
                    <div className="meta-hint">Интерактивный диапазон 0–100 лет</div>
                  </div>
                </>
              )}
            </div>
          </CardBody>
        </Card>

        <Card className="portrait-panel" hover>
          <div className="portrait-panel-head">
            <div className="panel-title-block">
              <div className="panel-icon">
                <TrendingUp size={18} />
              </div>
              <div>
                <div className="panel-title">Пол × Возраст</div>
                <div className="panel-subtitle">Кросс-анализ аудитории по полу и возрасту</div>
              </div>
            </div>
            <div className="panel-pill">Детальный срез</div>
          </div>
          <CardBody className="portrait-panel-body">
            <div className="chart-shell wide">
              {isInitialLoading ? (
                <LineChartSkeleton />
              ) : sexAgeChart.hasData ? (
                <Chart option={sexAgeChart.option as any} height={360} />
              ) : (
                <div className="panel-empty">Недостаточно данных для отображения графика</div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
