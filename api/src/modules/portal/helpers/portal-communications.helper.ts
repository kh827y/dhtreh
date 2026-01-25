import { Injectable } from '@nestjs/common';
import type { StaffNotifyActor } from '../../telegram/staff-notifications.service';
import type { PortalRequest } from '../portal.types';
import { asRecord, coerceCount } from '../../../shared/common/input.util';

@Injectable()
export class PortalCommunicationsHelper {
  normalizePushScope(scope?: string): 'ACTIVE' | 'ARCHIVED' {
    return scope === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  }

  normalizeTelegramScope(scope?: string): 'ACTIVE' | 'ARCHIVED' {
    return scope === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  }

  resolveTelegramActor(req: PortalRequest): StaffNotifyActor {
    if (req?.portalActor === 'STAFF' && req?.portalStaffId) {
      return { kind: 'STAFF', staffId: String(req.portalStaffId) };
    }
    return { kind: 'MERCHANT' };
  }

  extractMetadata(
    payload: Record<string, unknown>,
    stats: Record<string, unknown>,
  ): unknown {
    if (payload.metadata !== undefined) return payload.metadata;
    if (stats.metadata !== undefined) return stats.metadata;
    return null;
  }

  mapPushTask(task: unknown) {
    const taskRecord = asRecord(task) ?? {};
    const payload = asRecord(taskRecord.payload) ?? {};
    const stats = asRecord(taskRecord.stats) ?? {};
    const snapshot = asRecord(taskRecord.audienceSnapshot) ?? {};
    const audienceIdRaw = taskRecord.audienceId ?? snapshot.audienceId ?? null;
    const audienceId = typeof audienceIdRaw === 'string' ? audienceIdRaw : null;
    const audienceName =
      typeof taskRecord.audienceName === 'string'
        ? taskRecord.audienceName
        : typeof snapshot.audienceName === 'string'
          ? snapshot.audienceName
          : null;
    const audienceRaw =
      typeof audienceName === 'string'
        ? audienceName
        : typeof snapshot.code === 'string'
          ? snapshot.code
          : typeof snapshot.audienceName === 'string'
            ? snapshot.audienceName
            : 'ALL';
    const totalRecipients =
      typeof taskRecord.totalRecipients === 'number'
        ? taskRecord.totalRecipients
        : coerceCount(stats.totalRecipients ?? stats.total);
    const sent =
      typeof taskRecord.sentCount === 'number'
        ? taskRecord.sentCount
        : coerceCount(stats.sent ?? stats.delivered);
    const failed =
      typeof taskRecord.failedCount === 'number'
        ? taskRecord.failedCount
        : coerceCount(stats.failed ?? stats.errors);
    const metadata = this.extractMetadata(payload, stats);

    return {
      id: taskRecord.id,
      merchantId: taskRecord.merchantId,
      text: typeof payload.text === 'string' ? payload.text : '',
      audienceId,
      audienceName,
      audience: audienceRaw,
      scheduledAt: taskRecord.scheduledAt,
      timezone: taskRecord.timezone ?? null,
      status: taskRecord.status,
      totalRecipients,
      sent,
      failed,
      archivedAt: taskRecord.archivedAt ?? null,
      metadata: metadata ?? null,
      createdAt: taskRecord.createdAt,
      updatedAt: taskRecord.updatedAt,
    };
  }

  mapTelegramTask(task: unknown) {
    const taskRecord = asRecord(task) ?? {};
    const payload = asRecord(taskRecord.payload) ?? {};
    const stats = asRecord(taskRecord.stats) ?? {};
    const snapshot = asRecord(taskRecord.audienceSnapshot) ?? {};
    const media = asRecord(taskRecord.media) ?? {};
    const totalRecipients =
      typeof taskRecord.totalRecipients === 'number'
        ? taskRecord.totalRecipients
        : coerceCount(stats.totalRecipients ?? stats.total);
    const sent =
      typeof taskRecord.sentCount === 'number'
        ? taskRecord.sentCount
        : coerceCount(stats.sent ?? stats.delivered);
    const failed =
      typeof taskRecord.failedCount === 'number'
        ? taskRecord.failedCount
        : coerceCount(stats.failed ?? stats.errors);
    const metadata = this.extractMetadata(payload, stats);
    const imageAssetId = media.assetId ?? null;

    return {
      id: taskRecord.id,
      merchantId: taskRecord.merchantId,
      text: typeof payload.text === 'string' ? payload.text : '',
      audienceId: snapshot.audienceId ?? null,
      audienceName: snapshot.audienceName ?? null,
      audience: snapshot.code ?? snapshot.audienceName ?? 'ALL',
      scheduledAt: taskRecord.scheduledAt,
      timezone: taskRecord.timezone ?? null,
      status: taskRecord.status,
      totalRecipients,
      sent,
      failed,
      archivedAt: taskRecord.archivedAt ?? null,
      metadata: metadata ?? null,
      imageAssetId,
      createdAt: taskRecord.createdAt,
      updatedAt: taskRecord.updatedAt,
    };
  }
}
