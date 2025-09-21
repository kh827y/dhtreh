"use client";
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getStaff, updateStaff, issueStaffToken, revokeStaffToken } from '../../../lib/admin';

export default function StaffDetailPage() {
  const params = useParams();
  const router = useRouter();
  const staffId = params?.staffId as string;
  const [merchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [staff, setStaff] = useState<any>(null);
  const [login, setLogin] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<string>('CASHIER');
  const [status, setStatus] = useState<string>('ACTIVE');
  const [allowedOutletId, setAllowedOutletId] = useState<string>('');
  const [allowedDeviceId, setAllowedDeviceId] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadStaff();
  }, [staffId]);

  const loadStaff = async () => {
    try {
      const items = await getStaff(merchantId);
      const s = items.find((x: any) => x.id === staffId);
      if (s) {
        setStaff(s);
        setLogin(s.login || '');
        setEmail(s.email || '');
        setRole(s.role || 'CASHIER');
        setStatus(s.status || 'ACTIVE');
        setAllowedOutletId(s.allowedOutletId || '');
        setAllowedDeviceId(s.allowedDeviceId || '');
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await updateStaff(merchantId, staffId, {
        login: login || undefined,
        email: email || undefined,
        role: role as any,
        status: status as any,
        allowedOutletId: allowedOutletId || undefined,
        allowedDeviceId: allowedDeviceId || undefined,
      });
      setMsg('Updated successfully');
      loadStaff();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleIssueToken = async () => {
    setLoading(true);
    try {
      const result = await issueStaffToken(merchantId, staffId);
      setToken(result.token);
      setMsg('Token issued successfully. Save it securely - it won\'t be shown again.');
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!confirm('Revoke staff API key?')) return;
    setLoading(true);
    try {
      await revokeStaffToken(merchantId, staffId);
      setToken('');
      setMsg('Token revoked');
      loadStaff();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  if (!staff) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Staff: {staff.id}</h2>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => router.push('/staff')} style={{ marginRight: 8 }}>← Back</button>
      </div>
      
      {msg && <div style={{ color: msg.includes('successfully') ? '#a6e3a1' : '#f38ba8', marginBottom: 8 }}>{msg}</div>}
      
      <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
        <label>
          Login:
          <input value={login} onChange={e => setLogin(e.target.value)} style={{ marginLeft: 8, width: 200 }} />
        </label>
        <label>
          Email:
          <input value={email} onChange={e => setEmail(e.target.value)} style={{ marginLeft: 8, width: 200 }} />
        </label>
        <label>
          Role:
          <select value={role} onChange={e => setRole(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="CASHIER">CASHIER</option>
            <option value="MERCHANT">MERCHANT</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>
        <label>
          Status:
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </label>
        <label>
          Allowed Outlet ID:
          <input value={allowedOutletId} onChange={e => setAllowedOutletId(e.target.value)} style={{ marginLeft: 8, width: 200 }} placeholder="Optional" />
        </label>
        <label>
          Allowed Device ID:
          <input value={allowedDeviceId} onChange={e => setAllowedDeviceId(e.target.value)} style={{ marginLeft: 8, width: 200 }} placeholder="Optional" />
        </label>
        
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={handleUpdate} disabled={loading} style={{ padding: '6px 12px' }}>
            Update Staff
          </button>
        </div>
      </div>

      <h3 style={{ marginTop: 24 }}>API Key Management</h3>
      <div style={{ background: '#181825', padding: 12, borderRadius: 6 }}>
        <p style={{ marginBottom: 8, opacity: 0.8 }}>
          {staff.apiKeyHash ? 'API key is configured (hash stored)' : 'No API key configured'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleIssueToken} disabled={loading} style={{ padding: '6px 12px', background: '#89b4fa', color: '#1e1e2e' }}>
            Issue New Token
          </button>
          {staff.apiKeyHash && (
            <button onClick={handleRevokeToken} disabled={loading} style={{ padding: '6px 12px', background: '#f38ba8', color: '#1e1e2e' }}>
              Revoke Token
            </button>
          )}
        </div>
        
        {token && (
          <div style={{ marginTop: 12, padding: 8, background: '#1e1e2e', borderRadius: 4 }}>
            <p style={{ marginBottom: 4, color: '#f9e2af' }}>New API Key (save it now!):</p>
            <code style={{ display: 'block', padding: 8, background: '#11111b', borderRadius: 4, wordBreak: 'break-all' }}>
              {token}
            </code>
            <p style={{ marginTop: 8, opacity: 0.8, fontSize: '0.9em' }}>
              Use this as X-Staff-Key header in API requests
            </p>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, opacity: 0.8 }}>
        <p>Created: {new Date(staff.createdAt).toLocaleString()}</p>
        <p>Updated: {staff.updatedAt ? new Date(staff.updatedAt).toLocaleString() : 'Never'}</p>
      </div>
    </div>
  );
}
