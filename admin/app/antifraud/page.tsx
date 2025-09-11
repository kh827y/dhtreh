"use client";
import { useEffect, useState } from 'react';

export default function AntiFraudPage() {
  const [merchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [loading, setLoading] = useState<boolean>(false);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [nightActivity, setNightActivity] = useState<any[]>([]);
  const [serialRefunds, setSerialRefunds] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadReports();
  }, [dateRange]);

  const loadReports = async () => {
    setLoading(true);
    try {
      // Fetch transactions for analysis
      const txResponse = await fetch(`/api/admin/merchants/${merchantId}/transactions?limit=1000&from=${dateRange.from}&to=${dateRange.to}`);
      const transactions = await txResponse.json();
      
      // Analyze for anomalies
      analyzeAnomalies(transactions);
      analyzeNightActivity(transactions);
      
      // Fetch receipts for refund analysis
      const rcResponse = await fetch(`/api/admin/merchants/${merchantId}/receipts?limit=500`);
      const receipts = await rcResponse.json();
      analyzeSerialRefunds(receipts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const analyzeAnomalies = (transactions: any[]) => {
    const suspicious = [];
    
    // Group by customer
    const byCustomer = new Map<string, any[]>();
    for (const tx of transactions) {
      if (!byCustomer.has(tx.customerId)) {
        byCustomer.set(tx.customerId, []);
      }
      byCustomer.get(tx.customerId)!.push(tx);
    }
    
    // Find anomalies
    for (const [customerId, txs] of byCustomer) {
      // Rapid transactions (>5 in 1 hour)
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
      
      // Large single transactions (>10000)
      const largeTxs = txs.filter(tx => Math.abs(tx.amount) > 10000);
      if (largeTxs.length > 0) {
        suspicious.push({
          type: 'LARGE_TRANSACTION',
          customerId,
          transactions: largeTxs,
        });
      }
      
      // Unusual patterns (earn immediately followed by full redeem)
      const pattern = findEarnRedeemPattern(txs);
      if (pattern.length > 0) {
        suspicious.push({
          type: 'EARN_REDEEM_PATTERN',
          customerId,
          patterns: pattern,
        });
      }
    }
    
    setAnomalies(suspicious);
  };

  const findRapidTransactions = (txs: any[]) => {
    const sorted = [...txs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const rapid = [];
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = new Date(sorted[i].createdAt).getTime();
      const next = new Date(sorted[i + 1].createdAt).getTime();
      if (next - current < 3600000) { // 1 hour
        rapid.push(sorted[i], sorted[i + 1]);
      }
    }
    
    return [...new Set(rapid)];
  };

  const findEarnRedeemPattern = (txs: any[]) => {
    const sorted = [...txs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const patterns = [];
    
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].type === 'EARN' && sorted[i + 1].type === 'REDEEM') {
        const earnAmount = sorted[i].amount;
        const redeemAmount = Math.abs(sorted[i + 1].amount);
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

  const analyzeNightActivity = (transactions: any[]) => {
    const nightTxs = transactions.filter(tx => {
      const hour = new Date(tx.createdAt).getHours();
      return hour >= 0 && hour < 6; // 00:00 - 06:00
    });
    
    // Group by outlet/device
    const byOutlet = new Map<string, any[]>();
    for (const tx of nightTxs) {
      const key = `${tx.outletId || 'unknown'}/${tx.deviceId || 'unknown'}`;
      if (!byOutlet.has(key)) {
        byOutlet.set(key, []);
      }
      byOutlet.get(key)!.push(tx);
    }
    
    const nightStats = Array.from(byOutlet.entries()).map(([key, txs]) => ({
      outlet: key.split('/')[0],
      device: key.split('/')[1],
      count: txs.length,
      totalAmount: txs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
      transactions: txs,
    }));
    
    setNightActivity(nightStats.sort((a, b) => b.count - a.count));
  };

  const analyzeSerialRefunds = (receipts: any[]) => {
    // Find receipts with high refund rate
    const refundStats = new Map<string, { total: number; refunded: number; receipts: any[] }>();
    
    for (const receipt of receipts) {
      const key = `${receipt.outletId || 'unknown'}/${receipt.deviceId || 'unknown'}`;
      if (!refundStats.has(key)) {
        refundStats.set(key, { total: 0, refunded: 0, receipts: [] });
      }
      const stats = refundStats.get(key)!;
      stats.total++;
      stats.receipts.push(receipt);
      
      // Check if this receipt has refund (negative redeem/earn)
      if (receipt.redeemApplied < 0 || receipt.earnApplied < 0) {
        stats.refunded++;
      }
    }
    
    const highRefundRate = Array.from(refundStats.entries())
      .map(([key, stats]) => ({
        outlet: key.split('/')[0],
        device: key.split('/')[1],
        totalReceipts: stats.total,
        refundedReceipts: stats.refunded,
        refundRate: ((stats.refunded / stats.total) * 100).toFixed(1),
        receipts: stats.receipts.filter(r => r.redeemApplied < 0 || r.earnApplied < 0),
      }))
      .filter(s => s.refundRate > '10'); // More than 10% refund rate
    
    setSerialRefunds(highRefundRate.sort((a, b) => parseFloat(b.refundRate) - parseFloat(a.refundRate)));
  };

  return (
    <div>
      <h2>Anti-Fraud Report</h2>
      
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
                <p>{anomaly.transactions.length} large transactions (>10000 points)</p>
              )}
              {anomaly.type === 'EARN_REDEEM_PATTERN' && (
                <p>{anomaly.patterns.length} immediate redeem patterns detected</p>
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
                  <strong>Device:</strong> {activity.device}
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
                  <strong>Device:</strong> {location.device}
                </div>
                <div>
                  <strong style={{ color: '#fab387' }}>Refund Rate:</strong> {location.refundRate}%
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                  <strong>Refunded:</strong> {location.refundedReceipts} / {location.totalReceipts} receipts
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
