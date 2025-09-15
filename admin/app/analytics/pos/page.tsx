"use client";

import { useEffect, useMemo, useState } from "react";
import KpiCard from "../../../components/KpiCard";

// Types mirrored from /api/metrics response
type MetricsSummary = {
  posWebhooks?: Record<string, number>;
  posRequests?: Record<string, Record<string, Record<string, number>>>; // provider -> endpoint -> result -> count
  posErrors?: Record<string, Record<string, number>>; // provider -> endpoint -> count
};

export default function PosMetricsPage() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [error, setError] = useState<string>("");

  async function load() {
    try {
      const res = await fetch("/api/metrics");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSummary(data);
      setError("");
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  useEffect(() => {
    load().catch(() => {});
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const providers = useMemo(() => {
    const s = new Set<string>();
    Object.keys(summary?.posWebhooks || {}).forEach(p => s.add(p));
    Object.keys(summary?.posRequests || {}).forEach(p => s.add(p));
    Object.keys(summary?.posErrors || {}).forEach(p => s.add(p));
    return Array.from(s).sort();
  }, [summary]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">POS Integrations Metrics</h2>
        <div className="text-sm text-[#9fb0c9]">Автообновление каждые 15 секунд</div>
      </div>

      {error && (
        <div className="text-rose-400 text-sm">{error}</div>
      )}

      {/* Webhooks by provider */}
      <section>
        <h3 className="text-lg font-medium mb-2">Webhooks received</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {providers.map(p => (
            <KpiCard key={p} title={`${p} webhooks`} value={(summary?.posWebhooks?.[p] ?? 0).toString()} />
          ))}
        </div>
      </section>

      {/* Requests by provider/endpoint */}
      <section>
        <h3 className="text-lg font-medium mb-2">Requests by endpoint</h3>
        <div className="space-y-4">
          {providers.map(p => {
            const endpoints = Object.entries(summary?.posRequests?.[p] || {}).sort((a,b)=>a[0].localeCompare(b[0]));
            if (!endpoints.length) return (
              <div key={p} className="opacity-75 text-sm">{p}: данных нет</div>
            );
            return (
              <div key={p} className="rounded-xl border border-[#1e2a44] p-3 bg-[#0e1629]">
                <div className="font-medium mb-2">{p}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {endpoints.map(([endpoint, results]) => {
                    const ok = results["ok"] || 0;
                    const error = results["error"] || 0;
                    const other = Object.entries(results).filter(([k]) => k !== "ok" && k !== "error").reduce((acc, [,v]) => acc + (v||0), 0);
                    return (
                      <div key={`${p}-${endpoint}`} className="rounded-lg bg-[#111c31] p-3">
                        <div className="text-sm text-[#9fb0c9] mb-1">{endpoint}</div>
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="text-xs text-[#7f8ea3]">ok</div>
                            <div className="text-[#a6e3a1] font-semibold">{ok}</div>
                          </div>
                          <div>
                            <div className="text-xs text-[#7f8ea3]">error</div>
                            <div className="text-rose-400 font-semibold">{error}</div>
                          </div>
                          {other > 0 && (
                            <div>
                              <div className="text-xs text-[#7f8ea3]">other</div>
                              <div className="text-[#e6edf3] font-semibold">{other}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Errors by provider/endpoint */}
      <section>
        <h3 className="text-lg font-medium mb-2">Errors by endpoint</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {providers.flatMap(p => Object.entries(summary?.posErrors?.[p] || {}).map(([endpoint, cnt]) => (
            <KpiCard key={`${p}-${endpoint}-err`} title={`${p} · ${endpoint}`} value={cnt} />
          )))}
        </div>
      </section>
    </div>
  );
}
