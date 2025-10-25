"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart, Skeleton } from "@loyalty/ui";

type GenderItem = { sex: string; customers: number; transactions: number; revenue: number; averageCheck: number };
type AgeItem = { age: number; customers: number; transactions: number; revenue: number; averageCheck: number };
type SexAgeItem = { sex: string; age: number; customers: number; transactions: number; revenue: number; averageCheck: number };
type Resp = { gender: GenderItem[]; age: AgeItem[]; sexAge: SexAgeItem[] };

type AudienceOption = { value: string; label: string };

const defaultAudienceOption: AudienceOption = { value: "", label: "Все клиенты" };

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
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const params = new URLSearchParams({ period: "month" });
        if (audience.value) params.set("segmentId", audience.value);
        const res = await fetch(`/api/portal/analytics/portrait?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Ошибка загрузки");
        if (!cancelled) setData(json);
      } catch (error: any) {
        if (!cancelled) setMsg(String(error?.message || error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audience]);

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
      },
      series: [
        {
          name: "Пол",
          type: "pie",
          radius: ["38%", "70%"],
          itemStyle: { borderRadius: 12, borderColor: "#0f172a", borderWidth: 2 },
          labelLine: { show: false },
          label: { formatter: "{b}", color: "#e2e8f0" },
          data: seriesData,
        },
      ],
    } as const;
  }, [normalizedGenderData]);

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
        textStyle: { color: "rgba(226,232,240,0.85)" },
        data: metrics.map((metric) => metric.name),
      },
      grid: { left: 16, right: 32, top: 48, bottom: 32 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
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
        axisLabel: { color: "rgba(226,232,240,0.9)" },
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
  }, [normalizedGenderData]);

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
        textStyle: { color: "rgba(226,232,240,0.85)" },
      },
      grid: { left: 32, right: 32, top: 48, bottom: 80 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
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
        axisLabel: { color: "rgba(226,232,240,0.9)" },
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
  }, [data]);

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
          textStyle: { color: "rgba(226,232,240,0.85)" },
        },
        grid: { left: 32, right: 32, top: 48, bottom: 80 },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line" },
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
            color: "rgba(226,232,240,0.9)",
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
  }, [data]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Портрет клиента</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Статистика по аудиториям и базовым признакам</div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>Аудитории</span>
            <select
              value={audience.value}
              disabled={audiencesLoading}
              onChange={(event) => {
                const next = audiences.find((item) => item.value === event.target.value) || defaultAudienceOption;
                setAudience(next);
              }}
              style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }}
            >
              {audiences.map((item) => (
                <option key={item.value || "__default"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {audiencesError && (
            <span style={{ color: "#f87171", fontSize: 12 }}>{audiencesError}</span>
          )}
        </div>
      </header>

      {msg && !loading && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            background: "rgba(248,113,113,0.12)",
            color: "#fca5a5",
            fontSize: 13,
          }}
        >
          {msg}
        </div>
      )}

      <Card>
        <CardHeader title="Пол" subtitle="Доля клиентов и сопутствующие метрики" />
        <CardBody>
          {loading ? (
            <Skeleton height={320} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 360px) 1fr", gap: 24, alignItems: "center" }}>
              <Chart option={genderOption as any} height={300} />
              <div style={{ display: "grid", gap: 20 }}>
                {genderBarsOption ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      Средний чек, количество и сумма продаж по полу
                    </span>
                    <Chart option={genderBarsOption as any} height={320} />
                  </div>
                ) : (
                  <div style={{ opacity: 0.7 }}>Недостаточно данных по полу</div>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Возраст" subtitle="Распределение клиентов по возрастам и ключевым метрикам" />
        <CardBody>
          {loading ? <Skeleton height={260} /> : <Chart option={ageOption as any} height={320} />}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Зависимость пола и возраста" subtitle="Кросс-анализ аудиторий" />
        <CardBody>
          {loading ? (
            <Skeleton height={260} />
          ) : sexAgeChart.hasData ? (
            <Chart option={sexAgeChart.option as any} height={320} />
          ) : (
            <div style={{ opacity: 0.7 }}>Недостаточно данных для отображения графика</div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
