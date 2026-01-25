import { timingSafeEqual } from 'crypto';

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  const max = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(max);
  const paddedRight = Buffer.alloc(max);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  const matched = timingSafeEqual(paddedLeft, paddedRight);
  return matched && left.length === right.length;
}
