import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { createHmac } from 'crypto';
import type { MerchantSettings } from '@prisma/client';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

@Injectable()
export class LoyaltyWebhookService {
  constructor(private readonly cache: LookupCacheService) {}

  async applySignatureHeaders(params: {
    merchantId?: string;
    res: Response;
    payload: unknown;
    requestId?: string;
    settings?: Pick<
      MerchantSettings,
      | 'webhookSecret'
      | 'webhookKeyId'
      | 'webhookSecretNext'
      | 'webhookKeyIdNext'
      | 'useWebhookNext'
    > | null;
    useNextSecret?: boolean;
  }) {
    const { merchantId, res, payload, requestId, settings, useNextSecret } =
      params;
    if (!merchantId) return;
    try {
      const resolvedSettings =
        settings ?? (await this.cache.getMerchantSettings(merchantId));
      const useNext =
        useNextSecret ??
        (Boolean(resolvedSettings?.useWebhookNext) &&
          Boolean(resolvedSettings?.webhookSecretNext));
      const secret = useNext
        ? resolvedSettings?.webhookSecretNext
        : resolvedSettings?.webhookSecret;
      if (!secret) return;
      const ts = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify(payload);
      const sig = createHmac('sha256', secret)
        .update(`${ts}.${body}`)
        .digest('base64');
      res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
      res.setHeader('X-Merchant-Id', merchantId);
      res.setHeader('X-Signature-Timestamp', ts);
      const kid = useNext
        ? resolvedSettings?.webhookKeyIdNext
        : resolvedSettings?.webhookKeyId;
      if (kid) res.setHeader('X-Signature-Key-Id', kid);
      if (requestId) res.setHeader('X-Request-Id', requestId);
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyWebhookService apply headers',
        undefined,
        'debug',
      );
    }
  }
}
