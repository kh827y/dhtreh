import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function normalizeRulesJson(rulesJson: JsonValue): JsonValue {
  if (rulesJson == null) return rulesJson;
  if (Array.isArray(rulesJson)) return rulesJson;
  if (typeof rulesJson !== 'object') return rulesJson;

  const clone: Record<string, JsonValue> = { ...rulesJson };
  const afRaw = clone.af;
  if (afRaw && typeof afRaw === 'object' && !Array.isArray(afRaw)) {
    const af: Record<string, JsonValue> = { ...(afRaw as Record<string, JsonValue>) };
    const outletCfg = (af.outlet ?? (af as any).device) as JsonValue;
    if (outletCfg !== undefined) {
      if (outletCfg && typeof outletCfg === 'object' && !Array.isArray(outletCfg)) {
        af.outlet = { ...(outletCfg as Record<string, JsonValue>) };
      } else {
        af.outlet = outletCfg;
      }
    }
    if (Array.isArray(af.blockFactors)) {
      af.blockFactors = (af.blockFactors as JsonValue[]).map((factor) =>
        factor === 'no_device_id' ? 'no_outlet_id' : (factor as JsonValue),
      );
    }
    delete (af as any).device;
    clone.af = af;
  }
  return clone;
}

async function main() {
  const rows = await prisma.merchantSettings.findMany({
    where: { rulesJson: { not: null } },
    select: { merchantId: true, rulesJson: true },
  });

  let updated = 0;
  for (const row of rows) {
    const normalized = normalizeRulesJson(row.rulesJson as JsonValue);
    const originalStr = JSON.stringify(row.rulesJson);
    const normalizedStr = JSON.stringify(normalized);
    if (normalizedStr !== originalStr) {
      await prisma.merchantSettings.update({
        where: { merchantId: row.merchantId },
        data: { rulesJson: normalized as any },
      });
      updated += 1;
    }
  }

  if (updated) {
    console.log(`Migrated antifraud rules for ${updated} merchants.`);
  } else {
    console.log('No antifraud rules required migration.');
  }
}

main()
  .catch((err) => {
    console.error('Failed to migrate antifraud rules:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
