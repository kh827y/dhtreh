import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ promoCodeId: string }> }) {
  const { promoCodeId } = await params;
  if (!promoCodeId) {
    return new Response('promoCodeId required', { status: 400 });
  }
  const body = await req.json().catch(() => ({} as any));
  const payload: Record<string, any> = {
    name: body?.name ? String(body.name) : undefined,
    description: body?.description ? String(body.description) : undefined,
    code: body?.code ? String(body.code) : undefined,
    points: body?.points !== undefined ? Number(body.points) : undefined,
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
    validFrom: body?.validFrom ? String(body.validFrom) : undefined,
    validUntil: body?.validUntil ? String(body.validUntil) : undefined,
  };
  return portalFetch(req, `/portal/promocodes/${encodeURIComponent(promoCodeId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
