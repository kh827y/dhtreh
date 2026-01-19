import { BadRequestException } from '@nestjs/common';

// Разрешаем только латиницу/цифры/._- без пробелов, 2–64 символа
export const DEVICE_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,63}$/;

export type NormalizedDeviceCode = {
  code: string;
  normalized: string;
};

export function normalizeDeviceCode(raw: string): NormalizedDeviceCode {
  const code = (raw || '').trim();
  if (!code) {
    throw new BadRequestException(
      'Идентификатор устройства не может быть пустым',
    );
  }
  if (!DEVICE_CODE_REGEX.test(code)) {
    throw new BadRequestException(
      'Недопустимый идентификатор устройства: только латиница, цифры, точки, дефисы и подчёркивания длиной 2–64 символа',
    );
  }
  return { code, normalized: code.toLowerCase() };
}

export function ensureUniqueDeviceCodes(
  items: NormalizedDeviceCode[],
  limit = 50,
) {
  if (items.length > limit) {
    throw new BadRequestException(
      `Можно добавить не более ${limit} устройств на точку`,
    );
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.normalized)) {
      throw new BadRequestException(
        `Идентификатор устройства должен быть уникальным (${item.code})`,
      );
    }
    seen.add(item.normalized);
  }
}
