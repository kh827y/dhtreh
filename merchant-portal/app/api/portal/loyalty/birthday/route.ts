import { NextRequest } from "next/server";
import { portalFetch } from "../../_lib";

async function fetchSettings(req: NextRequest) {
  const res = await portalFetch(req, "/portal/settings", { method: "GET" });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, data, raw: text };
}

function resolveRulesJson(source: any) {
  if (!source || typeof source !== "object") return {};
  return { ...source };
}

export async function GET(req: NextRequest) {
  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  }

  const rules = resolveRulesJson(data?.rulesJson);
  const birthday = rules && typeof rules === "object" && typeof rules.birthday === "object" ? rules.birthday : {};

  const daysBefore = Math.max(0, Math.floor(Number(birthday?.daysBefore ?? birthday?.days ?? 5) || 5));
  const onlyBuyers = Boolean(birthday?.onlyBuyers ?? birthday?.buyersOnly ?? birthday?.onlyCustomers ?? false);
  const giftPoints = Math.max(0, Math.floor(Number(birthday?.giftPoints ?? 0) || 0));
  const giftTtlDays = Math.max(0, Math.floor(Number(birthday?.giftTtlDays ?? birthday?.giftTtl ?? 0) || 0));

  return Response.json({
    enabled: Boolean(birthday?.enabled ?? false),
    daysBefore,
    onlyBuyers,
    text:
      typeof birthday?.text === "string"
        ? birthday.text
        : "С днём рождения! Мы подготовили для вас подарок в любимой кофейне.",
    giftEnabled: giftPoints > 0,
    giftPoints,
    giftBurnEnabled: giftTtlDays > 0,
    giftTtlDays,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return new Response(JSON.stringify({ error: "BadRequest", message: "Invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const enabled = Boolean(body.enabled);
  const daysBeforeInput = Number(body.daysBefore ?? body.days);
  const daysBefore = Math.max(0, Math.floor(Number.isFinite(daysBeforeInput) ? daysBeforeInput : 0));
  if (enabled && daysBefore <= 0) {
    return new Response(
      JSON.stringify({ error: "ValidationError", message: "Количество дней до поздравления должно быть положительным" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const onlyBuyers = Boolean(body.onlyBuyers);
  const textValue = typeof body.text === "string" ? body.text.trim() : "";
  if (enabled && !textValue) {
    return new Response(JSON.stringify({ error: "ValidationError", message: "Укажите текст push-уведомления" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const giftEnabled = Boolean(body.giftEnabled);
  const giftPointsInput = Number(body.giftPoints);
  const giftPoints = giftEnabled ? Math.max(1, Math.floor(Number.isFinite(giftPointsInput) ? giftPointsInput : 0)) : 0;
  if (giftEnabled && giftPoints <= 0) {
    return new Response(JSON.stringify({ error: "ValidationError", message: "Количество подарочных баллов должно быть положительным" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const giftBurnEnabled = Boolean(body.giftBurnEnabled);
  const giftTtlDaysInput = Number(body.giftTtlDays);
  const giftTtlDays = giftBurnEnabled ? Math.max(1, Math.floor(Number.isFinite(giftTtlDaysInput) ? giftTtlDaysInput : 0)) : 0;
  if (giftBurnEnabled && giftTtlDays <= 0) {
    return new Response(
      JSON.stringify({ error: "ValidationError", message: "Срок сгорания подарочных баллов должен быть положительным" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  }

  const rules = resolveRulesJson(data?.rulesJson);
  const nextBirthday: Record<string, any> = {
    enabled,
    daysBefore,
    onlyBuyers,
    text: enabled ? textValue : textValue || "",
  };
  if (giftEnabled) {
    nextBirthday.giftPoints = giftPoints;
    if (giftBurnEnabled) {
      nextBirthday.giftTtlDays = giftTtlDays;
    } else if (nextBirthday.giftTtlDays) {
      delete nextBirthday.giftTtlDays;
    }
  } else {
    nextBirthday.giftPoints = 0;
    if (nextBirthday.giftTtlDays) {
      delete nextBirthday.giftTtlDays;
    }
  }

  rules.birthday = nextBirthday;

  const payload: Record<string, any> = {
    earnBps: data?.earnBps ?? 0,
    redeemLimitBps: data?.redeemLimitBps ?? 0,
    qrTtlSec: data?.qrTtlSec ?? undefined,
    webhookUrl: data?.webhookUrl ?? undefined,
    webhookSecret: data?.webhookSecret ?? undefined,
    webhookKeyId: data?.webhookKeyId ?? undefined,
    webhookSecretNext: data?.webhookSecretNext ?? undefined,
    webhookKeyIdNext: data?.webhookKeyIdNext ?? undefined,
    useWebhookNext: data?.useWebhookNext ?? undefined,
    redeemCooldownSec: data?.redeemCooldownSec ?? undefined,
    earnCooldownSec: data?.earnCooldownSec ?? undefined,
    redeemDailyCap: data?.redeemDailyCap ?? undefined,
    earnDailyCap: data?.earnDailyCap ?? undefined,
    requireJwtForQuote: data?.requireJwtForQuote ?? undefined,
    rulesJson: rules,
    requireBridgeSig: data?.requireBridgeSig ?? undefined,
    bridgeSecret: data?.bridgeSecret ?? undefined,
    bridgeSecretNext: data?.bridgeSecretNext ?? undefined,
    requireStaffKey: data?.requireStaffKey ?? undefined,
    pointsTtlDays: data?.pointsTtlDays ?? undefined,
    earnDelayDays: data?.earnDelayDays ?? undefined,
    telegramBotToken: data?.telegramBotToken ?? undefined,
    telegramBotUsername: data?.telegramBotUsername ?? undefined,
    telegramStartParamRequired: data?.telegramStartParamRequired ?? undefined,
    miniappBaseUrl: data?.miniappBaseUrl ?? undefined,
    miniappThemePrimary: data?.miniappThemePrimary ?? undefined,
    miniappThemeBg: data?.miniappThemeBg ?? undefined,
    miniappLogoUrl: data?.miniappLogoUrl ?? undefined,
  };

  const update = await portalFetch(req, "/portal/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const updateText = await update.text();
  return new Response(updateText, {
    status: update.status,
    headers: { "Content-Type": update.headers.get("content-type") ?? "application/json" },
  });
}
