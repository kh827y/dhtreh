"use client";
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDevices, updateDevice, issueDeviceSecret, revokeDeviceSecret, getOutlets } from '../../../lib/admin';

export default function DeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params?.deviceId as string;
  const [merchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [device, setDevice] = useState<any>(null);
  const [label, setLabel] = useState<string>('');
  const [outletId, setOutletId] = useState<string>('');
  const [outlets, setOutlets] = useState<any[]>([]);
  const [secret, setSecret] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadDevice();
    loadOutlets();
  }, [deviceId]);

  const loadDevice = async () => {
    try {
      const items = await getDevices(merchantId);
      const d = items.find((x: any) => x.id === deviceId);
      if (d) {
        setDevice(d);
        setLabel(d.label || '');
        setOutletId(d.outletId || '');
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const loadOutlets = async () => {
    try {
      const items = await getOutlets(merchantId);
      setOutlets(items);
    } catch {}
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await updateDevice(merchantId, deviceId, {
        label: label || undefined,
        outletId: outletId || undefined,
      });
      setMsg('Updated successfully');
      loadDevice();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleIssueSecret = async () => {
    setLoading(true);
    try {
      const result = await issueDeviceSecret(merchantId, deviceId);
      setSecret(result.secret);
      setMsg('Bridge secret issued successfully. Save it securely - it won\'t be shown again.');
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSecret = async () => {
    if (!confirm('Revoke device bridge secret?')) return;
    setLoading(true);
    try {
      await revokeDeviceSecret(merchantId, deviceId);
      setSecret('');
      setMsg('Bridge secret revoked');
      loadDevice();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  if (!device) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Device: {device.id}</h2>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => router.push('/devices')} style={{ marginRight: 8 }}>← Back</button>
      </div>
      
      {msg && <div style={{ color: msg.includes('successfully') ? '#a6e3a1' : '#f38ba8', marginBottom: 8 }}>{msg}</div>}
      
      <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
        <div>
          <strong>Type:</strong> {device.type}
        </div>
        <label>
          Label:
          <input value={label} onChange={e => setLabel(e.target.value)} style={{ marginLeft: 8, width: 200 }} placeholder="Optional label" />
        </label>
        <label>
          Outlet:
          <select value={outletId} onChange={e => setOutletId(e.target.value)} style={{ marginLeft: 8, width: 200 }}>
            <option value="">— None —</option>
            {outlets.map(o => (
              <option key={o.id} value={o.id}>{o.name} ({o.id})</option>
            ))}
          </select>
        </label>
        
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={handleUpdate} disabled={loading} style={{ padding: '6px 12px' }}>
            Update Device
          </button>
        </div>
      </div>

      <h3 style={{ marginTop: 24 }}>Bridge Secret Management</h3>
      <div style={{ background: '#181825', padding: 12, borderRadius: 6 }}>
        <p style={{ marginBottom: 8, opacity: 0.8 }}>
          {device.bridgeSecret ? 'Bridge secret is configured' : 'No bridge secret configured'}
        </p>
        <p style={{ marginBottom: 12, fontSize: '0.9em', opacity: 0.7 }}>
          Bridge secret allows this device to sign API requests independently from the merchant-wide bridge secret.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleIssueSecret} disabled={loading} style={{ padding: '6px 12px', background: '#89b4fa', color: '#1e1e2e' }}>
            Issue New Secret
          </button>
          {device.bridgeSecret && (
            <button onClick={handleRevokeSecret} disabled={loading} style={{ padding: '6px 12px', background: '#f38ba8', color: '#1e1e2e' }}>
              Revoke Secret
            </button>
          )}
        </div>
        
        {secret && (
          <div style={{ marginTop: 12, padding: 8, background: '#1e1e2e', borderRadius: 4 }}>
            <p style={{ marginBottom: 4, color: '#f9e2af' }}>New Bridge Secret (save it now!):</p>
            <code style={{ display: 'block', padding: 8, background: '#11111b', borderRadius: 4, wordBreak: 'break-all' }}>
              {secret}
            </code>
            <p style={{ marginTop: 8, opacity: 0.8, fontSize: '0.9em' }}>
              Configure this in your POS Bridge as BRIDGE_SECRET environment variable
            </p>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, opacity: 0.8 }}>
        <p>Created: {new Date(device.createdAt).toLocaleString()}</p>
        {device.updatedAt && <p>Updated: {new Date(device.updatedAt).toLocaleString()}</p>}
      </div>
    </div>
  );
}
