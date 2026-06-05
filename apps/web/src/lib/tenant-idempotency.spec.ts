import { getTenantCredentialIdempotencyKey } from './tenant-idempotency';

describe('Idempotencia de credenciales de la empresa', () => {
  it('reutiliza la misma key para reintentos de la misma empresa', () => {
    const generateKey = jest.fn().mockReturnValue('idem-1');
    const first = getTenantCredentialIdempotencyKey(null, 'tenant-1', generateKey);
    const second = getTenantCredentialIdempotencyKey(first, 'tenant-1', generateKey);

    expect(second).toBe(first);
    expect(second.key).toBe('idem-1');
    expect(generateKey).toHaveBeenCalledTimes(1);
  });

  it('genera una key nueva cuando cambia la empresa', () => {
    const generateKey = jest.fn().mockReturnValueOnce('idem-1').mockReturnValueOnce('idem-2');
    const first = getTenantCredentialIdempotencyKey(null, 'tenant-1', generateKey);
    const second = getTenantCredentialIdempotencyKey(first, 'tenant-2', generateKey);

    expect(second).toEqual({ tenantId: 'tenant-2', key: 'idem-2' });
    expect(generateKey).toHaveBeenCalledTimes(2);
  });
});
