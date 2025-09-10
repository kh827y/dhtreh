import { verifyBridgeSignature } from './bridge.util';
import { createHmac } from 'crypto';

function makeHeader(secret: string, body: string, ts?: number) {
  const t = Math.floor((ts ?? Date.now()) / 1000).toString();
  const sig = createHmac('sha256', secret).update(t + '.' + body).digest('base64');
  return `v1,ts=${t},sig=${sig}`;
}

describe('verifyBridgeSignature', () => {
  it('valid signature passes', () => {
    const secret = 's1';
    const body = JSON.stringify({ a: 1, b: 'x' });
    const header = makeHeader(secret, body);
    expect(verifyBridgeSignature(header, body, secret)).toBe(true);
  });

  it('invalid secret fails', () => {
    const body = JSON.stringify({ a: 2 });
    const header = makeHeader('s1', body);
    expect(verifyBridgeSignature(header, body, 'wrong')).toBe(false);
  });

  it('skew over 5 minutes fails', () => {
    const secret = 's1';
    const body = JSON.stringify({ z: 1 });
    const past = Date.now() - 10 * 60 * 1000; // -10min
    const header = makeHeader(secret, body, past);
    expect(verifyBridgeSignature(header, body, secret)).toBe(false);
  });
});

