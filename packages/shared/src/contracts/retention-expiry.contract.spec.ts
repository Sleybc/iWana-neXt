import { PrivacyRetentionExpiryTenantJobSchema } from './retention-expiry.contract';

const VALID = {
  version: 1,
  tenantId: '11111111-1111-4111-8111-111111111111',
  runId: '22222222-2222-4222-8222-222222222222',
};

describe('PrivacyRetentionExpiryTenantJob (H-EXP, ADR-105)', () => {
  it('acepta el payload mínimo con solo identificadores técnicos', () => {
    expect(PrivacyRetentionExpiryTenantJobSchema.parse(VALID)).toEqual(VALID);
  });

  it('rechaza campos de más: schema, slug, titular, fecha o secretos', () => {
    for (const extra of [
      { schemaName: 'tenant_demo' },
      { tenantSlug: 'demo' },
      { titularId: '33333333-3333-4333-8333-333333333333' },
      { date: '2026-11-08' },
      { hmac: 'abc' },
    ]) {
      expect(() => PrivacyRetentionExpiryTenantJobSchema.parse({ ...VALID, ...extra })).toThrow();
    }
  });

  it('rechaza uuid inválidos y versión distinta de 1', () => {
    expect(() =>
      PrivacyRetentionExpiryTenantJobSchema.parse({ ...VALID, tenantId: 'no-uuid' }),
    ).toThrow();
    expect(() =>
      PrivacyRetentionExpiryTenantJobSchema.parse({ ...VALID, runId: 'no-uuid' }),
    ).toThrow();
    expect(() => PrivacyRetentionExpiryTenantJobSchema.parse({ ...VALID, version: 2 })).toThrow();
  });
});
