export function booleanParam(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (value === 'true' || value === '1') return 'true';
  if (value === 'false' || value === '0') return 'false';
  return undefined;
}

export function buildStaffPayload(body: any) {
  const payload: Record<string, any> = {};
  if (body?.login !== undefined) payload.login = body.login == null ? null : String(body.login);
  if (body?.email !== undefined) payload.email = body.email == null ? null : String(body.email);
  if (body?.phone !== undefined) payload.phone = body.phone == null ? null : String(body.phone);
  if (body?.firstName !== undefined) payload.firstName = body.firstName == null ? null : String(body.firstName);
  if (body?.lastName !== undefined) payload.lastName = body.lastName == null ? null : String(body.lastName);
  if (body?.position !== undefined) payload.position = body.position == null ? null : String(body.position);
  if (body?.comment !== undefined) payload.comment = body.comment == null ? null : String(body.comment);
  if (body?.avatarUrl !== undefined) payload.avatarUrl = body.avatarUrl == null ? null : String(body.avatarUrl);
  if (body?.role !== undefined) payload.role = body.role == null ? null : String(body.role);
  if (body?.status !== undefined) payload.status = body.status == null ? null : String(body.status);
  if (body?.canAccessPortal !== undefined) payload.canAccessPortal = !!body.canAccessPortal;
  if (body?.portalAccessEnabled !== undefined) payload.portalAccessEnabled = !!body.portalAccessEnabled;
  if (body?.pinStrategy !== undefined) payload.pinStrategy = body.pinStrategy == null ? undefined : String(body.pinStrategy);
  if (body?.password !== undefined) {
    const raw = body.password == null ? null : String(body.password);
    payload.password = raw;
    if (raw && raw.trim()) {
      payload.canAccessPortal = true;
      payload.portalAccessEnabled = true;
    }
  }
  if (body?.currentPassword !== undefined) {
    payload.currentPassword =
      body.currentPassword == null ? null : String(body.currentPassword);
  }
  if (Array.isArray(body?.outletIds)) {
    payload.outletIds = body.outletIds.map((id: any) => String(id)).filter((id: string) => id.length > 0);
  }
  if (Array.isArray(body?.accessGroupIds)) {
    payload.accessGroupIds = body.accessGroupIds.map((id: any) => String(id)).filter((id: string) => id.length > 0);
  }
  return payload;
}
