import { Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { safeExecAsync } from './safe-exec';

const logger = new Logger('pg-lock');

function hashPair(name: string): [number, number] {
  // simple 32-bit rolling hashes for pair
  let a = 5381,
    b = 52711;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    a = ((a << 5) + a + c) | 0; // a*33 + c
    b = ((b << 5) + b + c) | 0;
  }
  // ensure in 32-bit signed int range
  return [a | 0, b | 0];
}

export async function pgTryAdvisoryLock(
  prisma: PrismaService,
  name: string,
): Promise<{ ok: boolean; key: [number, number] }> {
  const key = hashPair(name);
  return safeExecAsync(
    async () => {
      const rows = await prisma.$queryRaw<
        { ok: boolean }[]
      >`SELECT pg_try_advisory_lock(${key[0]}::int, ${key[1]}::int) as ok`;
      const ok = !!rows?.[0]?.ok;
      return { ok, key };
    },
    () => ({ ok: false, key }),
    logger,
    'pg_try_advisory_lock failed',
  );
}

export async function pgAdvisoryUnlock(
  prisma: PrismaService,
  key: [number, number],
): Promise<void> {
  await safeExecAsync(
    async () => {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${key[0]}::int, ${key[1]}::int)`;
    },
    () => undefined,
    logger,
    'pg_advisory_unlock failed',
  );
}
