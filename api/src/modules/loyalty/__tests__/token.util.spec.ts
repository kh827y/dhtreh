import { signQrToken, verifyQrToken, looksLikeJwt } from '../utils/token.util';

describe('QR token util', () => {
  const primary = 'secret_primary';
  const next = 'secret_next';

  it('signs and verifies with primary secret', async () => {
    const token = await signQrToken(primary, 'mc-1', 'M-1', 60);
    expect(looksLikeJwt(token)).toBe(true);
    const v = await verifyQrToken(primary, token);
    expect(v.customerId).toBe('mc-1');
    expect(v.merchantAud).toBe('M-1');
  });

  it('verifies with NEXT secret fallback when primary fails', async () => {
    process.env.QR_JWT_SECRET_NEXT = next;
    const token = await signQrToken(next, 'mc-2', 'M-2', 60);
    // verify with wrong primary should fallback to NEXT
    const v = await verifyQrToken(primary, token);
    expect(v.customerId).toBe('mc-2');
    expect(v.merchantAud).toBe('M-2');
  });

  it('throws on invalid token', async () => {
    await expect(verifyQrToken(primary, 'bad.token.here')).rejects.toBeTruthy();
  });
});
