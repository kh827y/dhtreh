"use client";

import React from "react";
import { Card, CardHeader, CardBody, Chart, Skeleton } from "@loyalty/ui";

type GenderItem = {
  sex: string;
  customers: number;
  transactions: number;
  revenue: number;
  averageCheck: number;
};
type AgeItem = {
  bucket: string;
  age: number;
  customers: number;
  transactions: number;
  revenue: number;
  averageCheck: number;
};
type SexAgeItem = {
  sex: string;
  bucket: string;
  age: number;
  customers: number;
  transactions: number;
  revenue: number;
  averageCheck: number;
};
type Resp = { gender: GenderItem[]; age: AgeItem[]; sexAge: SexAgeItem[] };

type AudienceOption = { value: string; label: string };

const FALLBACK_AUDIENCE: AudienceOption = { value: "all", label: "Все клиенты" };
const BASE_SEXES: Array<{ key: "M" | "F"; label: string; short: string }> = [
  { key: "M", label: "Мужской", short: "М" },
  { key: "F", label: "Женский", short: "Ж" },
];

export default function AnalyticsPortraitPage() {
  const [audiences, setAudiences] = React.useState<AudienceOption[]>([
    FALLBACK_AUDIENCE,
  ]);
  const [audience, setAudience] = React.useState<AudienceOption>(
    FALLBACK_AUDIENCE,
  );
  const [audiencesLoading, setAudiencesLoading] = React.useState(true);
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setAudiencesLoading(true);
      try {
        const res = await fetch(`/api/portal/audiences?includeSystem=1`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Ошибка загрузки аудиторий");
        const list = Array.isArray(json) ? json : [];
        const mapped = list
          .filter((item) => !item?.archivedAt)
          .map((item) => {
            const isAll = item?.isSystem && item?.systemKey === "all-customers";
            const rawValue = isAll ? FALLBACK_AUDIENCE.value : String(item?.id ?? "");
            if (!rawValue) return null;
            const label = String(
              item?.name || (isAll ? FALLBACK_AUDIENCE.label : "Без названия"),
            );
            return { value: rawValue, label } as AudienceOption;
          })
          .filter((item): item is AudienceOption => Boolean(item?.value));
        const map = new Map<string, AudienceOption>();
        for (const option of mapped) {
          if (!map.has(option.value)) map.set(option.value, option);
        }
        if (!map.has(FALLBACK_AUDIENCE.value)) {
          map.set(FALLBACK_AUDIENCE.value, FALLBACK_AUDIENCE);
        }
        const ordered = Array.from(map.values()).sort((a, b) => {
          if (a.value === FALLBACK_AUDIENCE.value) return -1;
          if (b.value === FALLBACK_AUDIENCE.value) return 1;
          return a.label.localeCompare(b.label, "ru", { sensitivity: "base" });
        });
        if (!cancelled) {
          setAudiences(ordered);
          setAudience((prev) => {
            const next = ordered.find((item) => item.value === prev.value);
            return next || ordered[0] || FALLBACK_AUDIENCE;
          });
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setAudiences([FALLBACK_AUDIENCE]);
          setAudience(FALLBACK_AUDIENCE);
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
        if (audience?.value && audience.value !== FALLBACK_AUDIENCE.value) {
          params.append("audienceId", audience.value);
        }
        const res = await fetch(
          `/api/portal/analytics/portrait?${params.toString()}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Ошибка загрузки");
        if (!cancelled) setData(json);
      } catch (error: any) {
        if (!cancelled) {
          setData(null);
          setMsg(String(error?.message || error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audience?.value]);

  type GenderDisplayItem = GenderItem & { label: string; short: string };

  const genderDisplay = React.useMemo<GenderDisplayItem[]>(() => {
    const map = new Map<string, GenderItem>();
    for (const item of data?.gender || []) {
      const normalized = item?.sex === "M" || item?.sex === "F" ? item.sex : "U";
      map.set(normalized, {
        sex: normalized,
        customers: item?.customers ?? 0,
        transactions: item?.transactions ?? 0,
        revenue: item?.revenue ?? 0,
        averageCheck: item?.averageCheck ?? 0,
      });
    }
    const extras = Array.from(map.entries()).filter(
      ([sex]) => !BASE_SEXES.some(({ key }) => key === sex),
    );
    const result: GenderDisplayItem[] = [];
    for (const base of BASE_SEXES) {
      const item = map.get(base.key) ?? {
        sex: base.key,
        customers: 0,
        transactions: 0,
        revenue: 0,
        averageCheck: 0,
      };
      result.push({ ...item, label: base.label, short: base.short });
    }
    for (const [sex, item] of extras) {
      const label = sex === "U" ? "Не указан" : String(sex || "—");
      const short = sex === "U" ? "—" : label.slice(0, 1).toUpperCase();
      result.push({ ...item, label, short });
    }
    return result;
  }, [data]);

  const genderPieOption = React.useMemo(() => {
    const labels = genderDisplay.map((item) => item.label);
    const series = genderDisplay.map((item) => ({
      value: item.customers,
      name: item.label,
    }));
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { orient: "horizontal", bottom: 0, data: labels },
      series: [
        {
          name: "Пол",
          type: "pie",
          radius: ["38%", "70%"],
          itemStyle: { borderRadius: 12, borderColor: "#0f172a", borderWidth: 2 },
          labelLine: { show: false },
          data: series,
        },
      ],
    } as const;
  }, [genderDisplay]);

  const genderBarItems = React.useMemo(
    () =>
      BASE_SEXES.map((sex) => {
        const item = genderDisplay.find((entry) => entry.sex === sex.key);
        return {
          label: sex.label,
          averageCheck: item?.averageCheck ?? 0,
          transactions: item?.transactions ?? 0,
          revenue: item?.revenue ?? 0,
        };
      }),
    [genderDisplay]
  );

  const createGenderBarOption = React.useCallback(
    (values: number[], color: string, seriesName: string) => ({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 12, right: 12, top: 24, bottom: 24, containLabel: true },
      xAxis: {
        type: "category",
        data: genderBarItems.map((item) => item.label),
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { show: false },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: seriesName,
          type: "bar",
          data: values,
          barWidth: "45%",
          itemStyle: { borderRadius: [8, 8, 0, 0], color },
        },
      ],
    }),
    [genderBarItems]
  );

  const genderAverageCheckOption = React.useMemo(
    () =>
      createGenderBarOption(
        genderBarItems.map((item) => item.averageCheck),
        "#f97316",
        "Средний чек",
      ),
    [createGenderBarOption, genderBarItems]
  );
  const genderTransactionsOption = React.useMemo(
    () =>
      createGenderBarOption(
        genderBarItems.map((item) => item.transactions),
        "#38bdf8",
        "Количество продаж",
      ),
    [createGenderBarOption, genderBarItems]
  );
  const genderRevenueOption = React.useMemo(
    () =>
      createGenderBarOption(
        genderBarItems.map((item) => item.revenue),
        "#22c55e",
        "Сумма продаж",
      ),
    [createGenderBarOption, genderBarItems]
  );

  const ageSeriesData = React.useMemo(() => {
    const map = new Map<number, AgeItem>();
    for (const item of data?.age || []) {
      const ageValue =
        typeof item.age === "number"
          ? item.age
          : Number.isFinite(Number(item.bucket))
            ? Number(item.bucket)
            : null;
      if (ageValue == null) continue;
      map.set(ageValue, item);
    }
    return Array.from({ length: 101 }, (_, age) => {
      const entry = map.get(age);
      return {
        age,
        customers: entry?.customers ?? 0,
        averageCheck: entry?.averageCheck ?? 0,
        transactions: entry?.transactions ?? 0,
        revenue: entry?.revenue ?? 0,
      };
    });
  }, [data]);

  const ageOption = React.useMemo(() => {
    const categories = ageSeriesData.map((item) => item.age);
    return {
      color: ["#38bdf8", "#f97316", "#a855f7", "#22c55e"],
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 40, right: 20, top: 50, bottom: 70 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: categories,
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } },
      },
      yAxis: [0, 1, 2, 3].map(() => ({
        type: "value",
        axisLabel: { show: false },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
      })),
      dataZoom: [
        {
          type: "slider",
          startValue: 15,
          endValue: 50,
          minValueSpan: 5,
          maxValueSpan: 50,
          bottom: 10,
          height: 24,
          showDetail: false,
          brushSelect: false,
        },
        {
          type: "inside",
          startValue: 15,
          endValue: 50,
          minValueSpan: 5,
          maxValueSpan: 50,
        },
      ],
      series: [
        {
          name: "Количество клиентов",
          type: "line",
          smooth: true,
          symbol: "circle",
          showSymbol: false,
          yAxisIndex: 0,
          data: ageSeriesData.map((item) => item.customers),
        },
        {
          name: "Средний чек",
          type: "line",
          smooth: true,
          symbol: "circle",
          showSymbol: false,
          yAxisIndex: 1,
          data: ageSeriesData.map((item) => item.averageCheck),
        },
        {
          name: "Количество продаж",
          type: "line",
          smooth: true,
          symbol: "circle",
          showSymbol: false,
          yAxisIndex: 2,
          data: ageSeriesData.map((item) => item.transactions),
        },
        {
          name: "Сумма продаж",
          type: "line",
          smooth: true,
          symbol: "circle",
          showSymbol: false,
          yAxisIndex: 3,
          data: ageSeriesData.map((item) => item.revenue),
        },
      ],
    } as const;
  }, [ageSeriesData]);

  const sexAgeSeriesData = React.useMemo(() => {
    const map = new Map<string, SexAgeItem>();
    for (const item of data?.sexAge || []) {
      if (item.sex !== "M" && item.sex !== "F") continue;
      const ageValue =
        typeof item.age === "number"
          ? item.age
          : Number.isFinite(Number(item.bucket))
            ? Number(item.bucket)
            : null;
      if (ageValue == null) continue;
      map.set(`${item.sex}:${ageValue}`, item);
    }
    const categories: string[] = [];
    const customers: number[] = [];
    const averageChecks: number[] = [];
    const transactions: number[] = [];
    const revenue: number[] = [];
    for (let age = 0; age <= 100; age++) {
      for (const base of BASE_SEXES) {
        const key = `${base.key}:${age}`;
        const entry = map.get(key);
        categories.push(`${base.short}-${age}`);
        customers.push(entry?.customers ?? 0);
        averageChecks.push(entry?.averageCheck ?? 0);
        transactions.push(entry?.transactions ?? 0);
        revenue.push(entry?.revenue ?? 0);
      }
    }
    return { categories, customers, averageChecks, transactions, revenue };
  }, [data]);

  const sexAgeOption = React.useMemo(() => {
    const startLabel = `${BASE_SEXES[0].short}-20`;
    const endLabel = `${BASE_SEXES[1].short}-37`;
    return {
      color: ["#38bdf8", "#f97316", "#a855f7", "#22c55e"],
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 40, right: 20, top: 50, bottom: 70 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: sexAgeSeriesData.categories,
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.4)" } },
      },
      yAxis: [0, 1, 2, 3].map(() => ({
        type: "value",
        axisLabel: { show: false },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
      })),
      dataZoom: [
        {
          type: "slider",
          startValue: startLabel,
          endValue: endLabel,
          minValueSpan: 4,
          maxValueSpan: 60,
          bottom: 10,
          height: 24,
          showDetail: false,
          brushSelect: false,
        },
        {
          type: "inside",
          startValue: startLabel,
          endValue: endLabel,
          minValueSpan: 4,
          maxValueSpan: 60,
        },
      ],
      series: [
        {
          name: "Количество клиентов",
          type: "line",
          smooth: true,
          symbol: "circle",
          showSymbol: false,
          yAxisIndex: 0,
          data: sexAgeSeriesData.customers,
        },
        {
          name: "Средний чек",
          type: "line",
          smooth: true,
          symbol: "circle",
          showSymbol: false,
          yAxisIndex: 1,
          data: sexAgeSeriesData.averageChecks,
        },
        {
          name: "Количество продаж",
          type: "line",
          smooth: true,
          symbol: "circle",
          showSymbol: false,
          yAxisIndex: 2,
          data: sexAgeSeriesData.transactions,
        },
        {
          name: "Сумма продаж",
          type: "line",
          smooth: true,
          symbol: "circle",
          showSymbol: false,
          yAxisIndex: 3,
          data: sexAgeSeriesData.revenue,
        },
      ],
    } as const;
  }, [sexAgeSeriesData]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Портрет клиента</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Статистика по аудиториям и базовым признакам</div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <span style={{ opacity: 0.75 }}>Аудитории</span>
          <select
            value={audience.value}
            onChange={(event) => {
              const next =
                audiences.find((item) => item.value === event.target.value) ||
                audiences[0];
              setAudience(next);
            }}
            disabled={audiencesLoading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(148,163,184,0.35)",
              color: audiencesLoading ? "rgba(226,232,240,0.5)" : "#e2e8f0",
            }}
          >
            {audiences.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <Card>
        <CardHeader title="Пол" subtitle="Доля клиентов и ключевые метрики" />
        <CardBody>
          {loading ? (
            <Skeleton height={360} />
          ) : data ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(260px, 320px) 1fr",
                gap: 24,
                alignItems: "stretch",
              }}
            >
              <Chart option={genderPieOption as any} height={320} />
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 16,
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  }}
                >
                  <Chart option={genderAverageCheckOption as any} height={160} />
                  <Chart option={genderTransactionsOption as any} height={160} />
                  <Chart option={genderRevenueOption as any} height={160} />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: "24px 0", color: "#f87171" }}>
              {msg || "Нет данных для отображения"}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Возраст" subtitle="Динамика показателей по возрасту" />
        <CardBody>
          {loading ? (
            <Skeleton height={360} />
          ) : data ? (
            <Chart option={ageOption as any} height={360} />
          ) : (
            <div style={{ padding: "24px 0", color: "#f87171" }}>
              {msg || "Нет данных для отображения"}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Зависимость пола и возраста" subtitle="Сравнение аудиторий во времени" />
        <CardBody>
          {loading ? (
            <Skeleton height={360} />
          ) : data ? (
            <Chart option={sexAgeOption as any} height={360} />
          ) : (
            <div style={{ padding: "24px 0", color: "#f87171" }}>
              {msg || "Нет данных для отображения"}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
