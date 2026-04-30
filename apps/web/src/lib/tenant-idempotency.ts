export interface TenantCredentialIdempotencyState {
  tenantId: string;
  key: string;
}

export function getTenantCredentialIdempotencyKey(
  current: TenantCredentialIdempotencyState | null,
  tenantId: string,
  generateKey: () => string,
): TenantCredentialIdempotencyState {
  if (current?.tenantId === tenantId) {
    return current;
  }

  return {
    tenantId,
    key: generateKey(),
  };
}
