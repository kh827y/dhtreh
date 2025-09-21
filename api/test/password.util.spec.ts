import { hashPassword, verifyPassword } from '../src/password.util';

describe('password.util (scrypt)', () => {
  it('hashes and verifies password correctly', () => {
    const pwd = 'S3cret-P@ssw0rd';
    const hash = hashPassword(pwd);
    expect(hash).toMatch(/^scrypt\$/);
    expect(verifyPassword(pwd, hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('fails verification with malformed stored value', () => {
    expect(verifyPassword('any', 'not-a-valid-hash')).toBe(false);
  });
});
