export type AudienceLike = {
  isSystem?: boolean | null;
  systemKey?: string | null;
  name?: string | null;
  label?: string | null;
};

export function isAllCustomersAudience(audience?: AudienceLike | null): boolean {
  if (!audience) return false;
  if (audience.systemKey === "all-customers") return true;
  if (audience.isSystem) {
    const name = String(audience.name ?? audience.label ?? "")
      .trim()
      .toLowerCase();
    return name === "все клиенты";
  }
  return false;
}
