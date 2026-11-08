import {
  EXPIRE_RETENTION_EXIT,
  expireRetentionApplyExitCode,
  parseExpireRetentionArgs,
} from './expire-retention';

const TENANT = '11111111-1111-4111-8111-111111111111';

describe('parseExpireRetentionArgs (H-EXP B2, CLI privacy:expire-retention)', () => {
  it('usa dry-run por defecto con solo --tenant', () => {
    expect(parseExpireRetentionArgs(['--tenant', TENANT])).toEqual({
      tenant: TENANT,
      mode: 'dry-run',
      help: false,
    });
  });

  it('acepta --apply y --verify-only por separado', () => {
    expect(parseExpireRetentionArgs(['--tenant', TENANT, '--apply']).mode).toBe('apply');
    expect(parseExpireRetentionArgs(['--tenant', TENANT, '--verify-only']).mode).toBe(
      'verify-only',
    );
  });

  it('rechaza --apply junto con --verify-only', () => {
    expect(() =>
      parseExpireRetentionArgs(['--tenant', TENANT, '--apply', '--verify-only']),
    ).toThrow(/excluyentes/i);
  });

  it('exige --tenant salvo con --help', () => {
    expect(() => parseExpireRetentionArgs([])).toThrow(/tenant/i);
    expect(parseExpireRetentionArgs(['--help']).help).toBe(true);
  });
});

describe('expireRetentionApplyExitCode (H-EXP B4-R2 B-5)', () => {
  const clean = { titulares: 1, prospectos: 0, solicitudes: 0, failed: 0 };

  it('sale en 0 si todos los lotes terminan sin fallos ni atención', () => {
    expect(
      expireRetentionApplyExitCode([
        { status: 'CONTINUE', counts: clean },
        { status: 'COMPLETE', counts: clean },
      ]),
    ).toBe(EXPIRE_RETENTION_EXIT.OK);
    expect(EXPIRE_RETENTION_EXIT.OK).toBe(0);
  });

  it('sale con código distinto de 0 si el lote final queda en ATTENTION_REQUIRED', () => {
    const code = expireRetentionApplyExitCode([{ status: 'ATTENTION_REQUIRED', counts: clean }]);
    expect(code).toBe(EXPIRE_RETENTION_EXIT.ATTENTION_REQUIRED);
    expect(code).not.toBe(0);
  });

  it('sale con código distinto de 0 si un lote intermedio dejó FAILED aunque el último sea COMPLETE', () => {
    const code = expireRetentionApplyExitCode([
      { status: 'CONTINUE', counts: { ...clean, failed: 1 } },
      { status: 'COMPLETE', counts: clean },
    ]);
    expect(code).toBe(EXPIRE_RETENTION_EXIT.ATTENTION_REQUIRED);
  });

  it('los códigos de salida son distintos entre sí', () => {
    expect(new Set(Object.values(EXPIRE_RETENTION_EXIT)).size).toBe(
      Object.values(EXPIRE_RETENTION_EXIT).length,
    );
  });
});
