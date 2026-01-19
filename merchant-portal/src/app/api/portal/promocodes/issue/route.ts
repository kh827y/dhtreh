import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({} as any));
  const payload: Record<string, any> = {
    name: body?.name ? String(body.name) : undefined,
    description: body?.description ? String(body.description) : undefined,
    code: String(body?.code || ''),
    points: Number(body?.points || 0),
    perCustomerLimit:
      body?.perCustomerLimit !== undefined ? Number(body.perCustomerLimit) : undefined,
    validFrom: body?.validFrom ? String(body.validFrom) : undefined,
    validUntil: body?.validUntil ? String(body.validUntil) : undefined,
    awardPoints: body?.awardPoints !== undefined ? !!body.awardPoints : undefined,
    burnEnabled: body?.burnEnabled !== undefined ? !!body.burnEnabled : undefined,
    burnDays: body?.burnDays !== undefined ? Number(body.burnDays) : undefined,
    levelEnabled: body?.levelEnabled !== undefined ? !!body.levelEnabled : undefined,
    levelId: body?.levelId ? String(body.levelId) : undefined,
    usageLimit: body?.usageLimit ? String(body.usageLimit) : undefined,
    usageLimitValue:
      body?.usageLimitValue !== undefined ? Number(body.usageLimitValue) : undefined,
    levelExpireDays:
      body?.levelExpireDays !== undefined ? Number(body.levelExpireDays) : undefined,
    overwrite: body?.overwrite === true ? true : undefined,
    usagePeriodEnabled: body?.usagePeriodEnabled !== undefined ? !!body.usagePeriodEnabled : undefined,
    usagePeriodDays: body?.usagePeriodDays !== undefined ? Number(body.usagePeriodDays) : undefined,
    recentVisitEnabled: body?.recentVisitEnabled !== undefined ? !!body.recentVisitEnabled : undefined,
    recentVisitHours: body?.recentVisitHours !== undefined ? Number(body.recentVisitHours) : undefined,
  };
  return portalFetch(req, `/portal/promocodes/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
