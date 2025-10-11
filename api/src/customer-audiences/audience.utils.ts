import { ALL_CUSTOMERS_SEGMENT_KEY } from './audience.constants';

export function isAllCustomersSegmentKey(
  key?: string | null,
): boolean {
  return key === ALL_CUSTOMERS_SEGMENT_KEY;
}

export function isSystemAllAudience(
  segment: { isSystem?: boolean | null; systemKey?: string | null } | null,
): boolean {
  if (!segment?.isSystem) return false;
  return isAllCustomersSegmentKey(segment.systemKey);
}
