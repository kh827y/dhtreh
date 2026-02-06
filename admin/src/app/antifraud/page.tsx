"use client";
import { useCallback, useEffect, useState } from 'react';
import { getSettings, resetAntifraudLimit } from '../../lib/admin';
import { usePreferredMerchantId } from '../../lib/usePreferredMerchantId';
import { useActionGuard, useLatestRequest } from '../../lib/async-guards';

type ResetScope = 'merchant' | 'customer' | 'staff' | 'device' | 'outlet';

type Transaction = {
  customerId?: string;
  amount?: number;
  createdAt?: string;
  type?: string;
  outletId?: string;
  outletPosType?: string;
  raw?: Record<string, unknown>;
};

type Anomaly =
  | {
      type: 'RAPID_TRANSACTIONS';
      customerId: string;
      count: number;
      period: string;
      transactions: Transaction[];
    }
  | {
      type: 'LARGE_TRANSACTION';
      customerId: string;
      transactions: Transaction[];
    }
  | {
      type: 'EARN_REDEEM_PATTERN';
      customerId: string;
      patterns: Array<{ earn: Transaction; redeem: Transaction; percentage: string }>;
    };

type NightActivity = {
  outlet: string;
  posType: string;
  count: number;
  totalAmount: number;
  transactions: Transaction[];
};

type SerialRefund = {
  outlet: string;
  posType: string;
  totalTransactions: number;
  refundedTransactions: number;
  refundRate: string;
  transactions: Transaction[];
};

type AfLimits = { limit: number; windowSec: number; dailyCap: number; weeklyCap: number };
const DEFAULT_TIMEZONE_CODE = 'MSK+4';
const TRANSACTION_LIMIT = 200;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown, fallback = 0): number => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toTimestamp = (value: unknown): number => {
  const base = typeof value === 'string' || typeof value === 'number' ? value : 0;
  const ts = new Date(base).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const toTransaction = (value: unknown): Transaction => {
  if (!isRecord(value)) return {};
  return {
    raw: value,
    customerId: typeof value.customerId === 'string' ? value.customerId : undefined,
    amount: typeof value.amount === 'number' ? value.amount : toNumber(value.amount, 0),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    type: typeof value.type === 'string' ? value.type : undefined,
    outletId: typeof value.outletId === 'string' ? value.outletId : undefined,
    outletPosType: typeof value.outletPosType === 'string' ? value.outletPosType : undefined,
  };
};

const resolveTimezoneOffsetMinutes = (code?: string | null) => {
  const normalized = String(code || DEFAULT_TIMEZONE_CODE).toUpperCase();
  const match = normalized.match(/MSK([+-]\\d+)/);
  const mskOffset = match ? Number(match[1]) : 4;
  if (!Number.isFinite(mskOffset)) return 180 + 4 * 60;
  return 180 + mskOffset * 60;
};

const findRapidTransactions = (txs: Transaction[]) => {
  const sorted = [...txs].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
  const rapid: Transaction[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = toTimestamp(sorted[i].createdAt);
    const next = toTimestamp(sorted[i + 1].createdAt);
    if (next - current < 3600000) { // 1 hour
      rapid.push(sorted[i], sorted[i + 1]);
    }
  }
  return [...new Set(rapid)];
};

const findEarnRedeemPattern = (txs: Transaction[]) => {
  const sorted = [...txs].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
  const patterns: Array<{ earn: Transaction; redeem: Transaction; percentage: string }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].type === 'EARN' && sorted[i + 1].type === 'REDEEM') {
      const earnAmount = toNumber(sorted[i].amount, 0);
      const redeemAmount = Math.abs(toNumber(sorted[i + 1].amount, 0));
      if (redeemAmount >= earnAmount * 0.9) { // 90% or more redeemed immediately
        patterns.push({
          earn: sorted[i],
          redeem: sorted[i + 1],
          percentage: (redeemAmount / earnAmount * 100).toFixed(1),
        });
      }
    }
  }
  return patterns;
};

const buildAnomalies = (transactions: Transaction[]): Anomaly[] => {
  const suspicious: Anomaly[] = [];
  const byCustomer = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const customerId = tx.customerId || 'unknown';
    if (!byCustomer.has(customerId)) {
      byCustomer.set(customerId, []);
    }
    byCustomer.get(customerId)!.push(tx);
  }
  for (const [customerId, txs] of byCustomer) {
    const rapidTxs = findRapidTransactions(txs);
    if (rapidTxs.length > 5) {
      suspicious.push({
        type: 'RAPID_TRANSACTIONS',
        customerId,
        count: rapidTxs.length,
        period: '1 hour',
        transactions: rapidTxs,
      });
    }
    const largeTxs = txs.filter((tx) => Math.abs(toNumber(tx.amount, 0)) > 10000);
    if (largeTxs.length > 0) {
      suspicious.push({
        type: 'LARGE_TRANSACTION',
        customerId,
        transactions: largeTxs,
      });
    }
    const pattern = findEarnRedeemPattern(txs);
    if (pattern.length > 0) {
      suspicious.push({
        type: 'EARN_REDEEM_PATTERN',
        customerId,
        patterns: pattern,
      });
    }
  }
  return suspicious;
};

const buildNightActivity = (transactions: Transaction[], timezoneCode?: string | null): NightActivity[] => {
  const offsetMinutes = resolveTimezoneOffsetMinutes(timezoneCode);
  const nightTxs = transactions.filter((tx) => {
    const time = toTimestamp(tx.createdAt);
    const local = new Date(time + offsetMinutes * 60 * 1000);
    const hour = local.getUTCHours();
    return hour >= 0 && hour < 6; // 00:00 - 06:00
  });
  const byOutlet = new Map<string, Transaction[]>();
  for (const tx of nightTxs) {
    const posType = tx.outletPosType || 'OUTLET';
    const outletId = tx.outletId || 'unknown';
    const key = `${outletId}/${posType}`;
    if (!byOutlet.has(key)) {
      byOutlet.set(key, []);
    }
    byOutlet.get(key)!.push(tx);
  }
  return Array.from(byOutlet.entries())
    .map(([key, txs]) => ({
      outlet: key.split('/')[0],
      posType: key.split('/')[1],
      count: txs.length,
      totalAmount: txs.reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount, 0)), 0),
      transactions: txs,
    }))
    .sort((a, b) => b.count - a.count);
};

const buildSerialRefunds = (transactions: Transaction[]): SerialRefund[] => {
  const refundStats = new Map<string, { total: number; refunded: number; transactions: Transaction[] }>();
  for (const tx of transactions) {
    const posType = tx.outletPosType || 'OUTLET';
    const outletId = tx.outletId || 'unknown';
    const key = `${outletId}/${posType}`;
    if (!refundStats.has(key)) {
      refundStats.set(key, { total: 0, refunded: 0, transactions: [] });
    }
    const stats = refundStats.get(key)!;
    stats.total++;
    if (tx.type === 'REFUND') {
      stats.refunded++;
      stats.transactions.push(tx);
    }
  }
  return Array.from(refundStats.entries())
    .map(([key, stats]) => ({
      outlet: key.split('/')[0],
      posType: key.split('/')[1],
      totalTransactions: stats.total,
      refundedTransactions: stats.refunded,
      refundRate: stats.total ? ((stats.refunded / stats.total) * 100).toFixed(1) : '0.0',
      transactions: stats.transactions,
    }))
    .filter((s) => parseFloat(s.refundRate) > 10)
    .sort((a, b) => parseFloat(b.refundRate) - parseFloat(a.refundRate));
};

export default function AntiFraudPage() {
  const { merchantId, setMerchantId } = usePreferredMerchantId();
  const [loading, setLoading] = useState<boolean>(false);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [nightActivity, setNightActivity] = useState<NightActivity[]>([]);
  const [serialRefunds, setSerialRefunds] = useState<SerialRefund[]>([]);
  const [merchantTimezone, setMerchantTimezone] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });
  const [af, setAf] = useState<{
    merchant: { limit: number; windowSec: number; dailyCap: number; weeklyCap: number };
    outlet: { limit: number; windowSec: number; dailyCap: number; weeklyCap: number };
    staff: { limit: number; windowSec: number; dailyCap: number; weeklyCap: number };
    customer: { limit: number; windowSec: number; dailyCap: number; weeklyCap: number };
  } | null>(null);
  const [cfgMsg, setCfgMsg] = useState('');
  const [bfStr, setBfStr] = useState('');
  const [resetScope, setResetScope] = useState<ResetScope>('merchant');
  const [resetTargetId, setResetTargetId] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const { start: startReports, isLatest: isLatestReports } = useLatestRequest();
  const { start: startConfig, isLatest: isLatestConfig } = useLatestRequest();
  const runAction = useActionGuard();

  const loadReports = useCallback(async () => {
    const requestId = startReports();
    setLoading(true);
    try {
      if (!merchantId) { if (isLatestReports(requestId)) setLoading(false); return; }
      // Fetch transactions for analysis
      const txParams = new URLSearchParams({ limit: String(TRANSACTION_LIMIT) });
      if (dateRange.from) txParams.set('from', dateRange.from);
      if (dateRange.to) txParams.set('to', dateRange.to);
      const txResponse = await fetch(`/api/admin/merchants/${merchantId}/transactions?${txParams.toString()}`);
      const txJson = await txResponse.json() as unknown;
      const rawItems = Array.isArray(txJson)
        ? txJson
        : isRecord(txJson) && Array.isArray(txJson.items)
          ? txJson.items
          : [];
      const transactions = rawItems.map(toTransaction);
      
      // Analyze for anomalies
      if (!isLatestReports(requestId)) return;
      setAnomalies(buildAnomalies(transactions));
      setNightActivity(buildNightActivity(transactions, merchantTimezone));
      setSerialRefunds(buildSerialRefunds(transactions));
    } catch (e: unknown) {
      if (!isLatestReports(requestId)) return;
      console.error(e);
    } finally {
      if (isLatestReports(requestId)) setLoading(false);
    }
  }, [dateRange.from, dateRange.to, merchantId, merchantTimezone, isLatestReports, startReports]);

  const loadAf = useCallback(async () => {
    const requestId = startConfig();
    try {
      if (!merchantId) return;
      const s = await getSettings(merchantId) as { timezone?: unknown; rulesJson?: unknown };
      if (!isLatestConfig(requestId)) return;
      setMerchantTimezone(String(s.timezone || DEFAULT_TIMEZONE_CODE));
      const rules = s.rulesJson;
      const rulesRecord = isRecord(rules) ? rules : null;
      const afObj = rulesRecord && isRecord(rulesRecord.af) ? rulesRecord.af : null;
      const def = (limit: number, windowSec: number, dailyCap = 0, weeklyCap = 0): AfLimits => ({
        limit,
        windowSec,
        dailyCap,
        weeklyCap,
      });
      const readLimits = (value: unknown, fallback: AfLimits): AfLimits => {
        if (!isRecord(value)) return fallback;
        return {
          limit: toNumber(value.limit, fallback.limit),
          windowSec: toNumber(value.windowSec, fallback.windowSec),
          dailyCap: toNumber(value.dailyCap, fallback.dailyCap),
          weeklyCap: toNumber(value.weeklyCap, fallback.weeklyCap),
        };
      };
      const outletSource = afObj && isRecord(afObj) ? (afObj.outlet ?? afObj.device) : null;
      setAf({
        merchant: readLimits(afObj && isRecord(afObj) ? afObj.merchant : null, def(200, 3600)),
        outlet: readLimits(outletSource, def(20, 600)),
        staff: readLimits(afObj && isRecord(afObj) ? afObj.staff : null, def(60, 600)),
        customer: readLimits(afObj && isRecord(afObj) ? afObj.customer : null, def(5, 120)),
      });
      const bfs = Array.isArray(afObj && isRecord(afObj) ? afObj.blockFactors : null)
        ? (afObj as { blockFactors: unknown[] }).blockFactors.map(String).join(',')
        : '';
      setBfStr(bfs);
      setCfgMsg('');
    } catch (e: unknown) {
      if (!isLatestConfig(requestId)) return;
      setCfgMsg('Не удалось загрузить настройки антифрода: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, [isLatestConfig, merchantId, startConfig]);

  useEffect(() => {
    if (!merchantId) return;
    loadAf();
  }, [merchantId, loadAf]);

  useEffect(() => {
    if (!merchantId) return;
    loadReports();
  }, [merchantId, loadReports]);

  const canReset = !!merchantId && (resetScope === 'merchant' || !!resetTargetId.trim());
  const runReset = async () => {
    if (!merchantId) return;
    await runAction(async () => {
      setResetBusy(true);
      setResetMsg('');
      try {
        await resetAntifraudLimit(merchantId, {
          scope: resetScope,
          targetId: resetScope === 'merchant' ? undefined : resetTargetId.trim(),
        });
        setResetMsg('Сброс выполнен.');
        setResetTargetId('');
      } catch (e: unknown) {
        setResetMsg(e instanceof Error ? e.message : 'Не удалось выполнить сброс');
      } finally {
        setResetBusy(false);
      }
    });
  };

  return (
    <div>
      <h2>Anti-Fraud Report</h2>
      <div style={{ display:'flex', gap:12, alignItems:'center', margin:'8px 0 16px' }}>
        <label>
          merchantId:
          <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} placeholder="Введите merchantId" style={{ marginLeft:8, padding:6, minWidth:200 }} />
        </label>
        {loading && <span>Загрузка…</span>}
      </div>
      {!merchantId && <div style={{ color:'#f38ba8', marginBottom:12 }}>Укажите merchantId, чтобы построить отчёт.</div>}

      <div style={{ marginTop: 16, padding: 16, background: '#11111b', borderRadius: 8, border: '1px solid #313244' }}>
        <h3 style={{ marginTop: 0 }}>Настройки лимитов (Velocity)</h3>
        <p style={{ opacity: 0.8, fontSize: 13, marginTop: 4 }}>
          Значения ниже отображаются только для чтения. Реальные лимиты на мерчанта/точку/сотрудника/клиента задаются через
          конфигурацию backend и/или rulesJson.af, а не из этой страницы.
        </p>
        {af ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <fieldset style={{ border: '1px solid #313244', borderRadius: 6, padding: 12 }}>
              <legend>Merchant</legend>
              <div style={{ display:'grid', gap:6, fontSize:13 }}>
                <div>Лимит: <code>{af.merchant.limit}</code></div>
                <div>Окно (сек): <code>{af.merchant.windowSec}</code></div>
                <div>Дневной кап: <code>{af.merchant.dailyCap}</code></div>
                <div>Недельный кап: <code>{af.merchant.weeklyCap}</code></div>
              </div>
            </fieldset>
            <fieldset style={{ border: '1px solid #313244', borderRadius: 6, padding: 12 }}>
              <legend>Outlet</legend>
              <div style={{ display:'grid', gap:6, fontSize:13 }}>
                <div>Лимит: <code>{af.outlet.limit}</code></div>
                <div>Окно (сек): <code>{af.outlet.windowSec}</code></div>
                <div>Дневной кап: <code>{af.outlet.dailyCap}</code></div>
                <div>Недельный кап: <code>{af.outlet.weeklyCap}</code></div>
              </div>
            </fieldset>
            <fieldset style={{ border: '1px solid #313244', borderRadius: 6, padding: 12 }}>
              <legend>Staff</legend>
              <div style={{ display:'grid', gap:6, fontSize:13 }}>
                <div>Лимит: <code>{af.staff.limit}</code></div>
                <div>Окно (сек): <code>{af.staff.windowSec}</code></div>
                <div>Дневной кап: <code>{af.staff.dailyCap}</code></div>
                <div>Недельный кап: <code>{af.staff.weeklyCap}</code></div>
              </div>
            </fieldset>
            <fieldset style={{ border: '1px solid #313244', borderRadius: 6, padding: 12 }}>
              <legend>Customer</legend>
              <div style={{ display:'grid', gap:6, fontSize:13 }}>
                <div>Лимит: <code>{af.customer.limit}</code></div>
                <div>Окно (сек): <code>{af.customer.windowSec}</code></div>
                <div>Дневной кап: <code>{af.customer.dailyCap}</code></div>
                <div>Недельный кап: <code>{af.customer.weeklyCap}</code></div>
              </div>
            </fieldset>
            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 4 }}>Факторы для жёсткой блокировки (rulesJson.af.blockFactors):</div>
                <code style={{ fontSize:12, whiteSpace:'pre-wrap' }}>{bfStr || '—'}</code>
              </div>
            </div>
            {cfgMsg && (
              <div style={{ gridColumn: 'span 2', fontSize: 12, opacity: 0.85 }}>{cfgMsg}</div>
            )}
          </div>
        ) : (
          <p style={{ opacity: 0.8 }}>Загрузка настроек…</p>
        )}
      </div>

      <div style={{ marginTop: 16, padding: 16, background: '#11111b', borderRadius: 8, border: '1px solid #313244' }}>
        <h3 style={{ marginTop: 0 }}>Быстрый сброс лимитов</h3>
        <p style={{ opacity: 0.8, fontSize: 13, marginTop: 4 }}>
          Используется для снятия ошибочных блокировок. Сброс влияет только на выбранный уровень и начинается «сейчас».
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'center' }}>
          <select value={resetScope} onChange={(e) => setResetScope(e.target.value as ResetScope)} style={{ padding: 8 }}>
            <option value="merchant">Мерчант</option>
            <option value="customer">Клиент</option>
            <option value="staff">Сотрудник</option>
            <option value="device">Устройство</option>
            <option value="outlet">Точка</option>
          </select>
          <input
            value={resetTargetId}
            onChange={(e) => setResetTargetId(e.target.value)}
            placeholder={resetScope === 'merchant' ? 'ID не требуется' : 'ID клиента/сотрудника/устройства/точки'}
            disabled={resetScope === 'merchant'}
            style={{ padding: 8 }}
          />
          <button onClick={runReset} disabled={!canReset || resetBusy} style={{ padding: '8px 12px' }}>
            {resetBusy ? 'Сброс…' : 'Сбросить'}
          </button>
        </div>
        {resetMsg && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>{resetMsg}</div>}
      </div>
      
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <label>
          From:
          <input 
            type="date" 
            value={dateRange.from} 
            onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            style={{ marginLeft: 8 }}
          />
        </label>
        <label>
          To:
          <input 
            type="date" 
            value={dateRange.to} 
            onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            style={{ marginLeft: 8 }}
          />
        </label>
        <button onClick={loadReports} disabled={loading} style={{ padding: '6px 12px' }}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <span style={{ opacity: 0.7, fontSize: 12 }}>
          Report uses last {TRANSACTION_LIMIT} transactions for the selected dates.
        </span>
      </div>

      <h3 style={{ marginTop: 24, color: '#f38ba8' }}>🚨 Anomalies Detected</h3>
      {anomalies.length === 0 ? (
        <p style={{ opacity: 0.8 }}>No anomalies detected</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {anomalies.map((anomaly, i) => (
            <div key={i} style={{ background: '#181825', padding: 12, borderRadius: 6, border: '1px solid #f38ba8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ color: '#f38ba8' }}>{anomaly.type}</strong>
                <span>Customer: {anomaly.customerId}</span>
              </div>
              {anomaly.type === 'RAPID_TRANSACTIONS' && (
                <p>{anomaly.count} transactions in {anomaly.period}</p>
              )}
              {anomaly.type === 'LARGE_TRANSACTION' && (
                <p>{(anomaly.transactions?.length ?? 0)} large transactions (&gt;10000 points)</p>
              )}
              {anomaly.type === 'EARN_REDEEM_PATTERN' && (
                <p>{(anomaly.patterns?.length ?? 0)} immediate redeem patterns detected</p>
              )}
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', opacity: 0.8 }}>View details</summary>
                <pre style={{ fontSize: '0.85em', marginTop: 8 }}>{JSON.stringify(anomaly, null, 2)}</pre>
              </details>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 24, color: '#f9e2af' }}>🌙 Night Activity (00:00 - 06:00)</h3>
      {nightActivity.length === 0 ? (
        <p style={{ opacity: 0.8 }}>No night activity detected</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {nightActivity.map((activity, i) => (
            <div key={i} style={{ background: '#181825', padding: 12, borderRadius: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <strong>Outlet:</strong> {activity.outlet}
                </div>
                <div>
                  <strong>POS:</strong> {activity.posType}
                </div>
                <div>
                  <strong>Transactions:</strong> {activity.count}
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                  <strong>Total Amount:</strong> {activity.totalAmount} points
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 24, color: '#fab387' }}>🔄 High Refund Rate Locations</h3>
      {serialRefunds.length === 0 ? (
        <p style={{ opacity: 0.8 }}>No locations with high refund rates</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {serialRefunds.map((location, i) => (
            <div key={i} style={{ background: '#181825', padding: 12, borderRadius: 6, border: '1px solid #fab387' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <strong>Outlet:</strong> {location.outlet}
                </div>
                <div>
                  <strong>POS:</strong> {location.posType}
                </div>
                <div>
                  <strong style={{ color: '#fab387' }}>Refund Rate:</strong> {location.refundRate}%
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                  <strong>Refunded:</strong> {location.refundedTransactions} / {location.totalTransactions} transactions
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 32, padding: 16, background: '#11111b', borderRadius: 8 }}>
        <h4>Detection Rules</h4>
        <ul style={{ opacity: 0.8, fontSize: '0.9em' }}>
          <li>Rapid Transactions: More than 5 transactions within 1 hour</li>
          <li>Large Transactions: Single transaction exceeding 10,000 points</li>
          <li>Earn-Redeem Pattern: Immediate redemption of 90% or more earned points</li>
          <li>Night Activity: Transactions between 00:00 and 06:00</li>
          <li>High Refund Rate: Locations with more than 10% refund rate</li>
        </ul>
      </div>
    </div>
  );
}
