"use client";
import { useEffect, useState } from 'react';
import { previewRules, getSettings, updateSettings } from '../../../lib/admin';

export default function RulesTestPage() {
  const [merchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [rules, setRules] = useState<any[]>([]);
  const [testScenarios, setTestScenarios] = useState<any[]>([
    { name: 'Weekday Smart POS 1000', channel: 'SMART', weekday: 1, eligibleTotal: 1000, category: '' },
    { name: 'Weekend PC POS 5000', channel: 'PC_POS', weekday: 6, eligibleTotal: 5000, category: '' },
    { name: 'Virtual Small 100', channel: 'VIRTUAL', weekday: 3, eligibleTotal: 100, category: '' },
    { name: 'Smart Large 50000', channel: 'SMART', weekday: 2, eligibleTotal: 50000, category: '' },
  ]);
  const [customScenario, setCustomScenario] = useState({
    channel: 'VIRTUAL' as 'VIRTUAL' | 'PC_POS' | 'SMART',
    weekday: 1,
    eligibleTotal: 1000,
    category: '',
  });
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [rulesJson, setRulesJson] = useState('');
  const [rulesError, setRulesError] = useState('');

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const settings = await getSettings(merchantId);
      setRules(settings.rulesJson || []);
      setRulesJson(JSON.stringify(settings.rulesJson || [], null, 2));
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const runTests = async () => {
    setLoading(true);
    const newResults: Record<string, any> = {};
    
    try {
      for (const scenario of testScenarios) {
        const result = await previewRules(merchantId, {
          channel: scenario.channel,
          weekday: scenario.weekday,
          eligibleTotal: scenario.eligibleTotal,
          category: scenario.category,
        });
        newResults[scenario.name] = result;
      }
      setResults(newResults);
      setMsg('Tests completed');
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const runCustomTest = async () => {
    setLoading(true);
    try {
      const result = await previewRules(merchantId, customScenario);
      setResults(prev => ({
        ...prev,
        'Custom Test': result,
      }));
      setMsg('Custom test completed');
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const validateAndSaveRules = async () => {
    try {
      const parsed = JSON.parse(rulesJson);
      setRulesError('');
      
      // Save to server
      setLoading(true);
      const settings = await getSettings(merchantId);
      await updateSettings(merchantId, {
        earnBps: settings.earnBps,
        redeemLimitBps: settings.redeemLimitBps,
        rulesJson: parsed,
      });
      
      setRules(parsed);
      setMsg('Rules saved successfully');
      await runTests(); // Re-run tests with new rules
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        setRulesError('Invalid JSON: ' + e.message);
      } else {
        setRulesError(String(e?.message || e));
      }
    } finally {
      setLoading(false);
    }
  };

  const addScenario = () => {
    const name = prompt('Scenario name:');
    if (!name) return;
    
    setTestScenarios(prev => [...prev, {
      name,
      channel: 'VIRTUAL' as const,
      weekday: 1,
      eligibleTotal: 1000,
      category: '',
    }]);
  };

  const removeScenario = (index: number) => {
    setTestScenarios(prev => prev.filter((_, i) => i !== index));
  };

  const updateScenario = (index: number, field: string, value: any) => {
    setTestScenarios(prev => prev.map((s, i) => 
      i === index ? { ...s, [field]: value } : s
    ));
  };

  return (
    <div>
      <h2>Rules Test Runner</h2>
      
      {msg && <div style={{ color: msg.includes('success') || msg.includes('completed') ? '#a6e3a1' : '#f38ba8', marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h3>Rules JSON</h3>
          <div style={{ marginBottom: 8 }}>
            <button onClick={validateAndSaveRules} disabled={loading} style={{ marginRight: 8, padding: '6px 12px' }}>
              Validate & Save
            </button>
            <button onClick={loadRules} disabled={loading} style={{ padding: '6px 12px' }}>
              Reload
            </button>
          </div>
          {rulesError && <div style={{ color: '#f38ba8', marginBottom: 8 }}>{rulesError}</div>}
          <textarea
            value={rulesJson}
            onChange={e => setRulesJson(e.target.value)}
            style={{
              width: '100%',
              height: 400,
              fontFamily: 'monospace',
              fontSize: '0.9em',
              background: '#11111b',
              color: '#cdd6f4',
              border: '1px solid #313244',
              borderRadius: 4,
              padding: 8,
            }}
          />
          
          <div style={{ marginTop: 16, padding: 12, background: '#181825', borderRadius: 6 }}>
            <h4>Rule Schema</h4>
            <pre style={{ fontSize: '0.85em', opacity: 0.8 }}>{`[
  {
    "if": {
      "channelIn": ["VIRTUAL", "PC_POS", "SMART"],
      "weekdayIn": [0-6], // 0=Sun, 6=Sat
      "minEligible": 1000,
      "categoryIn": ["category1", "category2"]
    },
    "then": {
      "earnBps": 1000, // 10%
      "redeemLimitBps": 3000 // 30%
    }
  }
]`}</pre>
          </div>
        </div>

        <div>
          <h3>Test Scenarios</h3>
          <div style={{ marginBottom: 12 }}>
            <button onClick={runTests} disabled={loading} style={{ marginRight: 8, padding: '6px 12px', background: '#89b4fa', color: '#1e1e2e' }}>
              Run All Tests
            </button>
            <button onClick={addScenario} style={{ padding: '6px 12px' }}>
              Add Scenario
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {testScenarios.map((scenario, i) => (
              <div key={i} style={{ background: '#181825', padding: 8, borderRadius: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 4, alignItems: 'center' }}>
                  <input
                    value={scenario.name}
                    onChange={e => updateScenario(i, 'name', e.target.value)}
                    style={{ background: '#11111b', border: '1px solid #313244', padding: 4, borderRadius: 2 }}
                  />
                  <select
                    value={scenario.channel}
                    onChange={e => updateScenario(i, 'channel', e.target.value)}
                    style={{ background: '#11111b', border: '1px solid #313244', padding: 4, borderRadius: 2 }}
                  >
                    <option value="VIRTUAL">VIRTUAL</option>
                    <option value="PC_POS">PC_POS</option>
                    <option value="SMART">SMART</option>
                  </select>
                  <input
                    type="number"
                    value={scenario.weekday}
                    onChange={e => updateScenario(i, 'weekday', parseInt(e.target.value))}
                    min="0"
                    max="6"
                    style={{ background: '#11111b', border: '1px solid #313244', padding: 4, borderRadius: 2 }}
                    placeholder="Day"
                  />
                  <input
                    type="number"
                    value={scenario.eligibleTotal}
                    onChange={e => updateScenario(i, 'eligibleTotal', parseInt(e.target.value))}
                    style={{ background: '#11111b', border: '1px solid #313244', padding: 4, borderRadius: 2 }}
                    placeholder="Amount"
                  />
                  <input
                    value={scenario.category}
                    onChange={e => updateScenario(i, 'category', e.target.value)}
                    style={{ background: '#11111b', border: '1px solid #313244', padding: 4, borderRadius: 2 }}
                    placeholder="Category"
                  />
                  <button onClick={() => removeScenario(i)} style={{ padding: '2px 8px', background: '#f38ba8', color: '#1e1e2e', borderRadius: 2 }}>
                    ×
                  </button>
                </div>
                {results[scenario.name] && (
                  <div style={{ marginTop: 4, padding: 4, background: '#11111b', borderRadius: 2, fontSize: '0.9em' }}>
                    Earn: {(results[scenario.name].earnBps / 100).toFixed(1)}% | 
                    Redeem limit: {(results[scenario.name].redeemLimitBps / 100).toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>

          <h3>Custom Test</h3>
          <div style={{ background: '#181825', padding: 12, borderRadius: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <label>
                Channel:
                <select
                  value={customScenario.channel}
                  onChange={e => setCustomScenario(prev => ({ ...prev, channel: e.target.value as any }))}
                  style={{ marginLeft: 8, width: 120 }}
                >
                  <option value="VIRTUAL">VIRTUAL</option>
                  <option value="PC_POS">PC_POS</option>
                  <option value="SMART">SMART</option>
                </select>
              </label>
              <label>
                Weekday:
                <input
                  type="number"
                  value={customScenario.weekday}
                  onChange={e => setCustomScenario(prev => ({ ...prev, weekday: parseInt(e.target.value) }))}
                  min="0"
                  max="6"
                  style={{ marginLeft: 8, width: 60 }}
                />
              </label>
              <label>
                Eligible Total:
                <input
                  type="number"
                  value={customScenario.eligibleTotal}
                  onChange={e => setCustomScenario(prev => ({ ...prev, eligibleTotal: parseInt(e.target.value) }))}
                  style={{ marginLeft: 8, width: 100 }}
                />
              </label>
              <label>
                Category:
                <input
                  value={customScenario.category}
                  onChange={e => setCustomScenario(prev => ({ ...prev, category: e.target.value }))}
                  style={{ marginLeft: 8, width: 100 }}
                  placeholder="Optional"
                />
              </label>
            </div>
            <button onClick={runCustomTest} disabled={loading} style={{ padding: '6px 12px' }}>
              Run Custom Test
            </button>
            {results['Custom Test'] && (
              <div style={{ marginTop: 8, padding: 8, background: '#11111b', borderRadius: 4 }}>
                <strong>Result:</strong> Earn {(results['Custom Test'].earnBps / 100).toFixed(1)}% | 
                Redeem limit {(results['Custom Test'].redeemLimitBps / 100).toFixed(1)}%
              </div>
            )}
          </div>

          <h3>Test Results Summary</h3>
          <div style={{ background: '#11111b', padding: 12, borderRadius: 6 }}>
            {Object.keys(results).length === 0 ? (
              <p style={{ opacity: 0.6 }}>No test results yet</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #313244' }}>
                    <th style={{ textAlign: 'left', padding: 4 }}>Scenario</th>
                    <th style={{ textAlign: 'right', padding: 4 }}>Earn %</th>
                    <th style={{ textAlign: 'right', padding: 4 }}>Redeem Limit %</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(results).map(([name, result]) => (
                    <tr key={name}>
                      <td style={{ padding: 4 }}>{name}</td>
                      <td style={{ textAlign: 'right', padding: 4, color: '#a6e3a1' }}>
                        {(result.earnBps / 100).toFixed(1)}%
                      </td>
                      <td style={{ textAlign: 'right', padding: 4, color: '#89b4fa' }}>
                        {(result.redeemLimitBps / 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
